/**
 * Chat Handler
 * Processes chat messages with multi-provider AI routing
 * Generates suggestions based on financial data
 */

import type {
  CloudflareEnv,
  ChatRequest,
  ChatResponse,
  FinancialSnapshot,
  AIMessage,
} from "../lib/types";
import { buildResponse, buildErrorResponse, parseJSON, log } from "../lib/utils";
import { AppErrorClass } from "../lib/utils";
import AIProviderManager from "../lib/ai-providers";

/**
 * Handle chat requests
 */
export async function handleChat(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  try {
    if (request.method !== "POST") {
      throw new AppErrorClass("METHOD_NOT_ALLOWED", "POST required", 405);
    }

    // Parse request body
    const body = await request.text();
    const chatRequest = parseJSON<ChatRequest>(body);

    if (!chatRequest) {
      throw new AppErrorClass("INVALID_JSON", "Invalid request body", 400);
    }

    const { userId, message, provider: preferredProvider, model } = chatRequest;

    if (!userId || !message) {
      throw new AppErrorClass(
        "MISSING_FIELDS",
        "userId and message are required",
        400
      );
    }

    log("info", "Chat request", {
      userId,
      messageLength: message.length,
      provider: preferredProvider,
    });

    // Initialize AI provider manager
    const aiManager = new AIProviderManager(env);

    // Prepare messages for AI
    const messages: AIMessage[] = [
      {
        role: "user",
        content: message,
      },
    ];

    // System prompt with financial context
    const systemPrompt = buildSystemPrompt();

    // Call AI provider
    const aiResponse = await aiManager.chat(
      messages,
      preferredProvider,
      systemPrompt
    );

    log("info", "Chat response generated", {
      provider: aiResponse.provider,
      model: aiResponse.model,
      tokens: aiResponse.tokens,
      cost: aiResponse.cost,
    });

    // Parse response for suggestions
    const suggestions = extractSuggestions(aiResponse.content);

    const response: ChatResponse = {
      messageId: generateMessageId(),
      content: aiResponse.content,
      provider: aiResponse.provider,
      model: aiResponse.model,
      suggestions,
    };

    return buildResponse(response, 200);
  } catch (error) {
    log("error", "Chat handler error", { error });
    return buildErrorResponse(error);
  }
}

/**
 * Build system prompt for financial AI
 * Incorporates Claude Learning Academy best practices
 */
function buildSystemPrompt(): string {
  return `You are a friendly, knowledgeable financial advisor helping users manage their personal finances.

Your responsibilities:
1. Analyze financial data provided by the user
2. Identify spending patterns and trends
3. Provide actionable recommendations
4. Help track progress toward financial goals
5. Suggest ways to optimize savings and investments

Communication Guidelines:
- Be conversational and empathetic
- Use clear, jargon-free language when possible
- Provide specific examples based on their data
- Ask clarifying questions when needed
- Focus on practical, implementable advice
- Celebrate financial wins and progress

Financial Best Practices (Claude Learning Academy):
- Emphasize spending awareness as the foundation
- Break down large goals into milestones
- Use the 50/30/20 rule as reference (needs/wants/savings)
- Consider emergency funds as critical
- Discuss opportunity costs of financial decisions
- Incorporate behavioral finance insights
- Consider inflation and time value of money

When providing analysis:
1. Start with key observations
2. Highlight positive trends
3. Identify areas for improvement
4. Suggest specific, measurable actions
5. Estimate potential impact of recommendations
6. Consider the user's income level and constraints

Remember: You're a helpful tool, not a substitute for professional financial advice. Encourage users to consult certified financial advisors for complex situations.`;
}

/**
 * Extract actionable suggestions from AI response
 * Looks for specific recommendations that can become proposals
 */
function extractSuggestions(content: string): string[] {
  const suggestions: string[] = [];

  // Look for numbered lists or bullet points
  const lines = content.split("\n");
  let inSuggestionSection = false;

  for (const line of lines) {
    // Check if this is a suggestion header
    if (
      line.toLowerCase().includes("recommendation") ||
      line.toLowerCase().includes("suggestion") ||
      line.toLowerCase().includes("action")
    ) {
      inSuggestionSection = true;
      continue;
    }

    // Extract numbered items or bullets
    if (inSuggestionSection) {
      const match = line.match(/^[\d.\-\*]\s+(.+)/);
      if (match) {
        suggestions.push(match[1].trim());
      }

      // Stop if we hit another section
      if (line.match(/^##\s/) && !line.toLowerCase().includes("recommendation")) {
        inSuggestionSection = false;
      }
    }
  }

  // Limit to top 3 suggestions
  return suggestions.slice(0, 3);
}

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Mock financial context (would come from database/Google Drive in production)
 */
export function getMockFinancialSnapshot(): FinancialSnapshot {
  return {
    totalAssets: 45000,
    totalLiabilities: 5000,
    netWorth: 40000,
    monthlyIncome: 4500,
    monthlyExpenses: 3200,
    savingsRate: 0.288,
    currency: "USD",
    lastUpdated: new Date().toISOString(),
    accounts: [
      {
        id: "acc_1",
        name: "Main Checking",
        currency: "USD",
        balance: 8500,
        type: "bank",
        lastSyncedAt: new Date().toISOString(),
      },
      {
        id: "acc_2",
        name: "Savings",
        currency: "USD",
        balance: 22000,
        type: "savings",
        lastSyncedAt: new Date().toISOString(),
      },
      {
        id: "acc_3",
        name: "Investment",
        currency: "USD",
        balance: 14500,
        type: "investment",
        lastSyncedAt: new Date().toISOString(),
      },
    ],
    recentTransactions: [
      {
        id: "t_1",
        date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
        description: "Grocery Store",
        amount: -85.32,
        currency: "USD",
        category: "Food & Dining",
        fromAccount: "acc_1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "t_2",
        date: new Date(Date.now() - 172800000).toISOString().split("T")[0],
        description: "Salary Deposit",
        amount: 4500,
        currency: "USD",
        category: "Income",
        toAccount: "acc_1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    goals: [
      {
        id: "g_1",
        name: "Emergency Fund",
        targetAmount: 15000,
        currentAmount: 12000,
        currency: "USD",
        deadline: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0],
        category: "Safety Net",
        priority: "high",
        createdAt: new Date().toISOString(),
      },
      {
        id: "g_2",
        name: "Vacation",
        targetAmount: 5000,
        currentAmount: 1200,
        currency: "USD",
        deadline: new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0],
        category: "Travel",
        priority: "medium",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
