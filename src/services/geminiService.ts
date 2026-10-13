/**
 * Gemini Service
 * Handles interactions with Google Gemini API for AI-guided onboarding
 */

import type { CloudflareEnv, AIMessage, UserSchemaDefinition } from "../lib/types";
import { log } from "../lib/utils";
import {
  sanitizeSchema,
  extractSchemaFromAIResponse,
} from "../utils/schemaValidator";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
/** gemini-2.0-flash was shut down by Google on 2026-06-01. Override with the GEMINI_MODEL var. */
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export interface GeminiStreamResponse {
  text: string;
  schemaUpdate?: Partial<UserSchemaDefinition>;
}

export class GeminiService {
  private apiKey: string;
  private model: string;

  constructor(env: CloudflareEnv) {
    this.apiKey = env.GEMINI_API_KEY || "";
    this.model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

    if (!this.apiKey) {
      log("warn", "Gemini API key not configured");
    }
  }

  /**
   * Stream AI response for onboarding chat
   * Uses Gemini 2.0 Flash for fast, streamed responses
   */
  async streamOnboardingResponse(
    messages: AIMessage[],
    type: "initial" | "progressive",
    focus?: string,
    currentSchema?: UserSchemaDefinition
  ): Promise<GeminiStreamResponse> {
    if (!this.apiKey) {
      return {
        text: "AI service temporarily unavailable. Please use form-based setup.",
      };
    }

    try {
      const systemPrompt = this.buildSystemPrompt(type, focus, currentSchema);

      log("debug", "Sending request to Gemini API", {
        model: this.model,
        messageCount: messages.length,
        type,
      });

      const response = await fetch(`${GEMINI_API_URL}/${this.model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Header rather than ?key= so the key never appears in URLs or logs
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          // Gemini only accepts the roles "user" and "model"
          contents: messages
            .filter((msg) => msg.role !== "system")
            .map((msg) => ({
              role: msg.role === "assistant" ? "model" : "user",
              parts: [{ text: msg.content }],
            })),
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 800,
            // 2.5 Flash "thinks" by default and counts it against maxOutputTokens,
            // which can leave the visible answer empty. Short chat replies don't need it.
            thinkingConfig: { thinkingBudget: 0 },
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        log("error", "Gemini API error", {
          status: response.status,
          model: this.model,
          error: error.slice(0, 500),
        });
        throw new Error(`Gemini API returned ${response.status}`);
      }

      const data = await response.json() as any;

      if (!data.candidates || data.candidates.length === 0) {
        log("warn", "No candidates in Gemini response", { promptFeedback: data.promptFeedback });
        throw new Error("Gemini returned no candidates");
      }

      const aiText: string = (data.candidates[0].content?.parts ?? [])
        .map((part: { text?: string }) => part.text ?? "")
        .join("")
        .trim();
      if (!aiText) {
        log("warn", "Empty Gemini answer", { finishReason: data.candidates[0].finishReason });
        throw new Error("Gemini returned an empty answer");
      }

      // Try to extract schema updates from response
      const schemaUpdate = extractSchemaFromAIResponse(aiText);
      const sanitizedUpdate = schemaUpdate
        ? sanitizeSchema(schemaUpdate)
        : undefined;

      return {
        text: aiText,
        schemaUpdate: sanitizedUpdate,
      };
    } catch (error) {
      log("error", "Gemini service error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Let the handler answer with HTTP 500 so the app shows a real error instead of a fake reply
      throw error;
    }
  }

  /**
   * Build system prompt based on onboarding stage
   * CRITICAL: All prompts must result in valid JSON output
   */
  private buildSystemPrompt(
    type: "initial" | "progressive",
    focus?: string,
    currentSchema?: UserSchemaDefinition
  ): string {
    if (type === "initial") {
      return `You are onboarding a new Finance Manager user. Your goal: collect essential schema information in 2-3 minutes.

User context:
- First-time user
- Limited time - needs to start using the app quickly
- Using conversational AI guidance (not a form)

Your Task:
1. Ask ONE question at a time, in natural conversation
2. Keep responses SHORT (1-2 sentences max)
3. Be friendly and encouraging
4. Collect information about:
   - Residence country (for tax purposes) - 2-3 letter country code (e.g., "US", "GB", "CA")
   - Account types they use - from: bank, card, investment, savings, crypto, other
   - Expense categories for tracking - custom strings they suggest
5. After collecting all three items, say: "Setup complete! You can now explore the dashboard."

CRITICAL OUTPUT FORMAT:
You MUST respond with valid JSON in this exact format:
{
  "message": "Your friendly conversational response here",
  "schemaUpdate": {
    "residenceCountries": ["COUNTRY_CODE"],
    "accountTypes": ["type1", "type2"],
    "expenseCategories": ["category1", "category2"]
  }
}

RULES for JSON output:
- Always include the "message" field with conversational text
- Only include schemaUpdate fields that you're collecting in this message
- Country codes: ALWAYS uppercase, 2-3 letters (e.g., ["US"], ["GB", "CA"])
- Account types: ALWAYS lowercase (e.g., ["bank", "investment"])
- Categories: Normal case, user-provided strings (e.g., ["Groceries", "Transportation"])
- If user hasn't provided information yet, still respond with schemaUpdate but leave arrays for fields still being collected
- Do NOT include null, undefined, or empty arrays in schemaUpdate
- Escape any quotes or special characters in the message string`;
    } else {
      // Progressive onboarding
      const focusInstructions = this.getFocusInstructions(focus);
      const schemaContext = currentSchema
        ? `\n\nCurrent schema:\n${JSON.stringify(currentSchema, null, 2)}`
        : "";

      return `You are helping a Finance Manager user enhance their setup.${schemaContext}

Focus area: ${focus || "general improvements"}

${focusInstructions}

Your Task:
- Be conversational but focused on the current topic
- Ask clarifying questions when needed
- Build schema progressively from responses
- Suggest reasonable defaults when appropriate
- Keep responses concise and friendly

CRITICAL OUTPUT FORMAT:
You MUST respond with valid JSON in this exact format:
{
  "message": "Your conversational response here",
  "schemaUpdate": {
    // Only include fields being modified for this focus area
    // Follow the same data format rules as initial onboarding
  },
  "complete": false
}

RULES for JSON output:
- Always include "message" field with conversational text
- Only include schemaUpdate fields that are being updated
- Follow data format rules: uppercase country codes, lowercase account types, etc.
- Do NOT include null, undefined, or empty arrays
- Escape any special characters in the message string
- The "complete" field should be false unless the user has finished this focus area`;
    }
  }

  /**
   * Get focus-specific instructions
   */
  private getFocusInstructions(focus?: string): string {
    switch (focus) {
      case "investments":
        return `Help them add investment account details:
- Types of investments (stocks, ETFs, bonds, crypto, etc.)
- Where they're held (brokerage names, custodian)
- Whether they track cost basis
- Investment preferences (aggressive, conservative, balanced)`;

      case "household":
        return `Help them add household member information:
- Names of spouse, children, dependents
- Relationships (spouse, child, dependent, etc.)
- Ages (for education planning context)
- Financial involvement (joint accounts, shared goals, etc.)`;

      case "goals":
        return `Help them set financial goals:
- Types of goals (retirement, education, house, vacation, etc.)
- Target amounts
- Target dates/timelines
- Priority levels
- Currency preferences`;

      case "tax":
        return `Help them configure tax settings:
- Primary tax country/jurisdiction
- Filing status
- Number of dependents
- Multi-country tax concerns
- Deduction categories relevant to them`;

      case "categories":
        return `Help them customize expense categories:
- Review default categories
- Add custom categories specific to their spending
- Remove irrelevant categories
- Organize categories by frequency/importance`;

      default:
        return "Help them explore available improvements to their financial setup.";
    }
  }

  /**
   * Check if API is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Extract structured schema from AI response
   * Handles cases where AI returns JSON or prose
   */
  extractSchema(aiResponse: string): Partial<UserSchemaDefinition> | null {
    return extractSchemaFromAIResponse(aiResponse);
  }
}

/**
 * Factory function to create Gemini service
 */
export function createGeminiService(env: CloudflareEnv): GeminiService {
  return new GeminiService(env);
}
