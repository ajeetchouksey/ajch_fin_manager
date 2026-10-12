/**
 * Multi-Provider AI Management
 * Supports Claude, Gemini, and OpenAI with fallback routing
 * Follows Claude Learning Academy best practices for financial calculations
 */

import type {
  AIProvider,
  AIProviderConfig,
  AIResponse,
  AIMessage,
  CloudflareEnv,
  FinancialSnapshot,
} from "./types";
import { AppErrorClass, log, retryWithBackoff } from "./utils";

// Provider configurations with model pricing
const PROVIDER_CONFIGS: Record<AIProvider, Omit<AIProviderConfig, "apiKeyEnv">> = {
  claude: {
    name: "claude",
    models: {
      cheap: "claude-3-5-haiku-20241022", // ~0.40 per 1M input, 1.50 per 1M output
      standard: "claude-3-5-sonnet-20241022", // ~3.00 per 1M input, 15.00 per 1M output
      powerful: "claude-3-opus-20250219", // ~15.00 per 1M input, 75.00 per 1M output
    },
    baseUrl: "https://api.anthropic.com/v1",
  },
  gemini: {
    name: "gemini",
    models: {
      cheap: "gemini-2.0-flash", // Free tier available, ~$0.075/1M input, ~$0.30/1M output
      standard: "gemini-1.5-pro", // ~$1.50/1M input, ~$6.00/1M output
      powerful: "gemini-2.0-flash-advanced", // Advanced reasoning, ~$1.75/1M input, ~$7.00/1M output
    },
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  openai: {
    name: "openai",
    models: {
      cheap: "gpt-4o-mini", // ~$0.15/1M input, $0.60/1M output
      standard: "gpt-4-turbo", // ~$10.00/1M input, $30.00/1M output
      powerful: "gpt-4o", // ~$2.50/1M input, $10.00/1M output
    },
    baseUrl: "https://api.openai.com/v1",
  },
  none: {
    name: "none",
    models: {
      cheap: "none",
      standard: "none",
      powerful: "none",
    },
  },
};

// Default provider fallback chain (prioritizes free/cheap options)
// Gemini 2.0 Flash (free) → Claude Haiku (cheap paid) → GPT-4o Mini (cheap paid)
const PROVIDER_FALLBACK_CHAIN: AIProvider[] = ["gemini", "claude", "openai"];

// Cost per million tokens (for rate limiting and monitoring)
const TOKEN_COSTS: Record<
  AIProvider,
  Record<string, { input: number; output: number }>
> = {
  claude: {
    "claude-3-5-haiku-20241022": { input: 0.4, output: 1.5 },
    "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
    "claude-3-opus-20250219": { input: 15.0, output: 75.0 },
  },
  gemini: {
    "gemini-2.0-flash": { input: 0.075, output: 0.3 },
    "gemini-1.5-pro": { input: 1.5, output: 6.0 },
    "gemini-2.0-flash-advanced": { input: 1.75, output: 7.0 },
  },
  openai: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4-turbo": { input: 10.0, output: 30.0 },
    "gpt-4o": { input: 2.5, output: 10.0 },
  },
  none: {},
};

/**
 * AI Provider Manager
 * Handles multi-provider routing with fallback logic
 */
export class AIProviderManager {
  private env: CloudflareEnv;
  private defaultProvider: AIProvider;
  private availableProviders: AIProvider[] = [];

  constructor(env: CloudflareEnv) {
    this.env = env;
    this.defaultProvider = (env.DEFAULT_AI_PROVIDER || "gemini") as AIProvider;
    this.initializeAvailableProviders();
  }

  /**
   * Check which providers have API keys configured
   */
  private initializeAvailableProviders(): void {
    const providers: AIProvider[] = [];

    if (this.env.CLAUDE_API_KEY) {
      providers.push("claude");
    }
    if (this.env.GEMINI_API_KEY) {
      providers.push("gemini");
    }
    if (this.env.OPENAI_API_KEY) {
      providers.push("openai");
    }

    this.availableProviders = providers.length > 0 ? providers : ["none"];
    log("info", "Available AI providers", { providers: this.availableProviders });
  }

  /**
   * Get the best available provider with fallback logic
   */
  getProvider(
    preferred?: AIProvider
  ): {
    provider: AIProvider;
    model: string;
    apiKey?: string;
  } {
    // Check if preferred provider is available
    if (preferred && this.availableProviders.includes(preferred)) {
      return this.getProviderConfig(preferred, "cheap");
    }

    // Use default provider if available
    if (this.availableProviders.includes(this.defaultProvider)) {
      return this.getProviderConfig(this.defaultProvider, "cheap");
    }

    // Fall through fallback chain
    for (const provider of PROVIDER_FALLBACK_CHAIN) {
      if (this.availableProviders.includes(provider)) {
        return this.getProviderConfig(provider, "cheap");
      }
    }

    // Last resort: return "none" provider
    return {
      provider: "none",
      model: "none",
    };
  }

  /**
   * Get specific provider configuration
   */
  private getProviderConfig(
    provider: AIProvider,
    tier: "cheap" | "standard" | "powerful"
  ): {
    provider: AIProvider;
    model: string;
    apiKey?: string;
  } {
    const config = PROVIDER_CONFIGS[provider];
    const model = config.models[tier];
    const apiKey = this.getApiKey(provider);

    return {
      provider,
      model,
      apiKey,
    };
  }

  /**
   * Get API key for provider
   */
  private getApiKey(provider: AIProvider): string | undefined {
    switch (provider) {
      case "claude":
        return this.env.CLAUDE_API_KEY;
      case "gemini":
        return this.env.GEMINI_API_KEY;
      case "openai":
        return this.env.OPENAI_API_KEY;
      default:
        return undefined;
    }
  }

  /**
   * Call Claude API
   */
  async callClaude(
    messages: AIMessage[],
    model: string,
    systemPrompt?: string
  ): Promise<AIResponse> {
    const apiKey = this.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new AppErrorClass(
        "PROVIDER_NOT_AVAILABLE",
        "Claude API key not configured",
        503
      );
    }

    return retryWithBackoff(async () => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as Record<string, unknown>;
        throw new AppErrorClass(
          "CLAUDE_API_ERROR",
          `Claude API error: ${error.message}`,
          response.status,
          error
        );
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };
      const content = data.content[0]?.text || "";

      return {
        provider: "claude",
        model,
        content,
        tokens: {
          input: data.usage.input_tokens,
          output: data.usage.output_tokens,
        },
        cost:
          (TOKEN_COSTS.claude[model]?.input ?? 0) * (data.usage.input_tokens / 1000000) +
          (TOKEN_COSTS.claude[model]?.output ?? 0) *
            (data.usage.output_tokens / 1000000),
      };
    });
  }

  /**
   * Call Gemini API
   */
  async callGemini(
    messages: AIMessage[],
    model: string,
    systemPrompt?: string
  ): Promise<AIResponse> {
    const apiKey = this.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AppErrorClass(
        "PROVIDER_NOT_AVAILABLE",
        "Gemini API key not configured",
        503
      );
    }

    return retryWithBackoff(async () => {
      const contents = messages.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      if (systemPrompt && contents.length > 0) {
        contents.unshift({
          role: "user",
          parts: [{ text: `System: ${systemPrompt}` }],
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.7,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = (await response.json()) as Record<string, unknown>;
        throw new AppErrorClass(
          "GEMINI_API_ERROR",
          `Gemini API error: ${String((error?.error as Record<string, unknown>)?.message || "Unknown error")}`,
          response.status,
          error
        );
      }

      const data = (await response.json()) as {
        candidates: Array<{
          content: { parts: Array<{ text: string }> };
        }>;
        usageMetadata?: {
          inputTokenCount: number;
          outputTokenCount: number;
        };
      };

      const content =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const inputTokens = data.usageMetadata?.inputTokenCount || 0;
      const outputTokens = data.usageMetadata?.outputTokenCount || 0;

      return {
        provider: "gemini",
        model,
        content,
        tokens: {
          input: inputTokens,
          output: outputTokens,
        },
        cost:
          (TOKEN_COSTS.gemini[model]?.input ?? 0) * (inputTokens / 1000000) +
          (TOKEN_COSTS.gemini[model]?.output ?? 0) * (outputTokens / 1000000),
      };
    });
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(
    messages: AIMessage[],
    model: string,
    systemPrompt?: string
  ): Promise<AIResponse> {
    const apiKey = this.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppErrorClass(
        "PROVIDER_NOT_AVAILABLE",
        "OpenAI API key not configured",
        503
      );
    }

    return retryWithBackoff(async () => {
      const apiMessages = [...messages];
      if (systemPrompt) {
        apiMessages.unshift({
          role: "system",
          content: systemPrompt,
        });
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as Record<string, unknown>;
        throw new AppErrorClass(
          "OPENAI_API_ERROR",
          `OpenAI API error: ${String((error?.error as Record<string, unknown>)?.message || "Unknown error")}`,
          response.status,
          error
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };

      const content = data.choices?.[0]?.message?.content || "";
      const inputTokens = data.usage.prompt_tokens;
      const outputTokens = data.usage.completion_tokens;

      return {
        provider: "openai",
        model,
        content,
        tokens: {
          input: inputTokens,
          output: outputTokens,
        },
        cost:
          (TOKEN_COSTS.openai[model]?.input ?? 0) * (inputTokens / 1000000) +
          (TOKEN_COSTS.openai[model]?.output ?? 0) * (outputTokens / 1000000),
      };
    });
  }

  /**
   * Universal chat method with provider routing
   */
  async chat(
    messages: AIMessage[],
    preferredProvider?: AIProvider,
    systemPrompt?: string
  ): Promise<AIResponse> {
    const { provider, model, apiKey } = this.getProvider(preferredProvider);

    if (!apiKey || provider === "none") {
      throw new AppErrorClass(
        "NO_AI_PROVIDER",
        "No AI provider configured. Please add API keys.",
        503
      );
    }

    try {
      switch (provider) {
        case "claude":
          return await this.callClaude(messages, model, systemPrompt);
        case "gemini":
          return await this.callGemini(messages, model, systemPrompt);
        case "openai":
          return await this.callOpenAI(messages, model, systemPrompt);
        default:
          throw new AppErrorClass(
            "UNKNOWN_PROVIDER",
            `Unknown provider: ${provider}`,
            500
          );
      }
    } catch (error) {
      log("error", "AI provider error", { provider, model, error });
      throw error;
    }
  }

  /**
   * Generate financial analysis prompt (Claude Learning Academy best practices)
   * Combines structured financial data with natural language reasoning
   */
  buildFinancialAnalysisPrompt(snapshot: FinancialSnapshot): string {
    const {
      totalAssets,
      totalLiabilities,
      netWorth,
      monthlyIncome,
      monthlyExpenses,
      savingsRate,
      currency,
      accounts,
      recentTransactions,
      goals,
    } = snapshot;

    return `
# Financial Analysis Request

## Current Financial Snapshot (${currency})
- **Total Assets**: ${totalAssets.toFixed(2)}
- **Total Liabilities**: ${totalLiabilities.toFixed(2)}
- **Net Worth**: ${netWorth.toFixed(2)}
- **Monthly Income**: ${monthlyIncome.toFixed(2)}
- **Monthly Expenses**: ${monthlyExpenses.toFixed(2)}
- **Savings Rate**: ${(savingsRate * 100).toFixed(1)}%

## Account Summary
${accounts
  .slice(0, 5)
  .map(
    (a) =>
      `- ${a.type.toUpperCase()}: ${a.name} - ${a.currency} ${a.balance.toFixed(2)}`
  )
  .join("\n")}

## Recent Transactions (Last 5)
${recentTransactions
  .slice(0, 5)
  .map(
    (t) =>
      `- ${t.date}: ${t.description} (${t.category}) - ${t.currency} ${t.amount.toFixed(2)}`
  )
  .join("\n")}

## Financial Goals
${goals
  .map(
    (g) =>
      `- ${g.name}: ${g.currency} ${g.targetAmount.toFixed(2)} by ${g.deadline} (${(
        (g.currentAmount / g.targetAmount) *
        100
      ).toFixed(1)}% complete)`
  )
  .join("\n")}

## Analysis Request
Based on the financial data above, provide:
1. Key observations about financial health
2. Spending patterns and trends
3. Progress towards stated goals
4. Actionable recommendations for improvement
5. Risks or concerns to address

Focus on practical, specific advice that considers the user's income and expenses.
`;
  }
}

export default AIProviderManager;
