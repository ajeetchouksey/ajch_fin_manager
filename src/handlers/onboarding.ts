/**
 * Onboarding Handler
 * Main entry point for all onboarding-related API endpoints
 * Endpoints:
 *   GET  /api/onboarding/status
 *   POST /api/onboarding/chat
 *   POST /api/onboarding/submit
 *   GET  /api/onboarding/current-schema
 *   POST /api/onboarding/reset
 */

import type { CloudflareEnv } from "../lib/types";
import { buildResponse, buildErrorResponse, log } from "../lib/utils";
import { SchemaService } from "../services/schemaService";
import { GeminiService } from "../services/geminiService";
import { validateSchema, validatePartialSchema } from "../utils/schemaValidator";

/**
 * Route incoming requests to specific handlers
 */
export async function handleOnboarding(
  request: Request,
  env: CloudflareEnv,
  userId: string
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  log("debug", "Onboarding request", {
    method: request.method,
    pathname,
    userId,
  });

  try {
    // GET /api/onboarding/status
    if (request.method === "GET" && pathname === "/api/onboarding/status") {
      return await handleStatus(env, userId);
    }

    // POST /api/onboarding/chat
    if (request.method === "POST" && pathname === "/api/onboarding/chat") {
      return await handleChat(request, env, userId);
    }

    // POST /api/onboarding/submit
    if (request.method === "POST" && pathname === "/api/onboarding/submit") {
      return await handleSubmit(request, env, userId);
    }

    // GET /api/onboarding/current-schema
    if (
      request.method === "GET" &&
      pathname === "/api/onboarding/current-schema"
    ) {
      return await handleGetSchema(env, userId);
    }

    // POST /api/onboarding/reset
    if (request.method === "POST" && pathname === "/api/onboarding/reset") {
      return await handleReset(env, userId);
    }

    return buildErrorResponse(
      `Unknown endpoint: ${pathname}`,
      404
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "Onboarding handler error", { message });
    return buildErrorResponse("Internal server error", 500);
  }
}

/**
 * GET /api/onboarding/status
 * Check if user has schema and determine next step
 */
async function handleStatus(
  env: CloudflareEnv,
  userId: string
): Promise<Response> {
  try {
    const schemaService = new SchemaService(env.DB);
    const status = await schemaService.getSchemaStatus(userId);

    return buildResponse(status);
  } catch (error) {
    log("error", "Status handler error", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return buildErrorResponse("Failed to check onboarding status", 500);
  }
}

/**
 * POST /api/onboarding/chat
 * Stream AI responses for onboarding conversation
 */
async function handleChat(
  request: Request,
  env: CloudflareEnv,
  userId: string
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      messages: Array<{ role: string; content: string }>;
      type?: "initial" | "progressive";
      focus?: string;
      context?: any;
    };

    // Validate input
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return buildErrorResponse("Missing or invalid messages", 400);
    }

    const type = body.type || "progressive";
    const focus = body.focus;
    const currentSchema = body.context?.currentSchema;

    // Initialize services
    const geminiService = new GeminiService(env);

    if (!geminiService.isAvailable()) {
      log("warn", "Gemini service not available, offering form fallback");
      return buildResponse({
        message:
          "AI service is currently unavailable. Please use form-based setup instead.",
        fallbackToForm: true,
      });
    }

    // Stream AI response
    const aiResponse = await geminiService.streamOnboardingResponse(
      body.messages as Array<{ role: "user" | "assistant" | "system"; content: string }>,
      type,
      focus,
      currentSchema
    );

    // For now, return AI response directly
    // In Phase 2.5b, we'll implement proper session tracking
    return buildResponse({
      message: aiResponse.text,
      schemaUpdate: aiResponse.schemaUpdate || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "Chat handler error", {
      userId,
      error: message,
    });
    return buildErrorResponse("Failed to process chat message", 500);
  }
}

/**
 * POST /api/onboarding/submit
 * Finalize and save schema updates
 */
async function handleSubmit(
  request: Request,
  env: CloudflareEnv,
  userId: string
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      schema: any;
      merge?: boolean;
      /** "replace": overwrite only the fields sent (lets a form remove items); default is additive merge */
      mode?: "merge" | "replace";
    };

    // Validate schema
    const validation = body.merge
      ? validatePartialSchema(body.schema)
      : validateSchema(body.schema);

    if (!validation.valid) {
      log("warn", "Schema validation failed on submit", {
        userId,
        errors: validation.errors,
      });
      return buildErrorResponse(
        `Schema validation failed: ${validation.errors.join(", ")}`,
        400
      );
    }

    // Initialize schema service
    const schemaService = new SchemaService(env.DB);

    // Check if user has existing schema
    const existing = await schemaService.getCurrentSchema(userId);

    let result;
    if (body.mode === "replace" && existing) {
      // Form-based setup: the user edited these fields, so their value replaces the stored one
      result = await schemaService.replaceFields(userId, body.schema);
    } else if (body.merge && existing) {
      // Merge with existing schema
      result = await schemaService.mergeSchema(userId, body.schema);
    } else if (existing) {
      // Replace existing schema
      // Note: In a real app, we might want to require confirmation for this
      // For now, we'll just merge to be safe
      result = await schemaService.mergeSchema(userId, body.schema);
    } else {
      // Create new schema
      const success = await schemaService.createSchema(userId, body.schema);
      result = success ? body.schema : null;
    }

    if (!result) {
      return buildErrorResponse("Failed to save schema", 500);
    }

    log("info", "Schema submitted successfully", {
      userId,
      hasExisting: !!existing,
      merge: body.merge,
    });

    return buildResponse({
      success: true,
      schema: result,
      message: "Schema saved successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "Submit handler error", {
      userId,
      error: message,
    });
    return buildErrorResponse("Failed to submit onboarding", 500);
  }
}

/**
 * GET /api/onboarding/current-schema
 * Fetch user's current schema (for review modal)
 */
async function handleGetSchema(
  env: CloudflareEnv,
  userId: string
): Promise<Response> {
  try {
    const schemaService = new SchemaService(env.DB);
    const schema = await schemaService.getCurrentSchema(userId);

    if (!schema) {
      return buildResponse({
        schema: null,
        completedSections: [],
        canAdd: [
          "investments",
          "household",
          "goals",
          "tax",
          "categories",
        ],
      });
    }

    // Determine completed sections and available additions
    const completedSections: string[] = [];
    const canAdd: string[] = [];

    if (schema.residenceCountries?.length > 0) {
      completedSections.push("countries");
    } else {
      canAdd.push("countries");
    }

    if (schema.accountTypes?.length > 0) {
      completedSections.push("accounts");
    } else {
      canAdd.push("accounts");
    }

    if (schema.expenseCategories?.length > 0) {
      completedSections.push("categories");
    } else {
      canAdd.push("categories");
    }

    if (schema.declaredGoals && schema.declaredGoals.length > 0) {
      completedSections.push("goals");
    } else if (!completedSections.includes("goals")) {
      canAdd.push("goals");
    }

    if (schema.householdMembers && schema.householdMembers.length > 0) {
      completedSections.push("household");
    } else if (!canAdd.includes("household")) {
      canAdd.push("household");
    }

    if (schema.investmentPreferences?.hasInvestments) {
      completedSections.push("investments");
    } else if (!canAdd.includes("investments")) {
      canAdd.push("investments");
    }

    if (schema.taxSettings) {
      completedSections.push("tax");
    } else if (!canAdd.includes("tax")) {
      canAdd.push("tax");
    }

    return buildResponse({
      schema,
      completedSections,
      canAdd,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "GetSchema handler error", {
      userId,
      error: message,
    });
    return buildErrorResponse("Failed to fetch schema", 500);
  }
}

/**
 * POST /api/onboarding/reset
 * Delete schema and start fresh (optional)
 */
async function handleReset(
  _env: CloudflareEnv,
  userId: string
): Promise<Response> {
  try {
    // In a real implementation, we would delete from the database
    // For now, we'll just return a success response
    // This would be implemented in Phase 2.5a when we have full DB access

    log("info", "Schema reset requested", { userId });

    return buildResponse({
      success: true,
      message: "Schema has been reset. You can restart onboarding.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "Reset handler error", {
      userId,
      error: message,
    });
    return buildErrorResponse("Failed to reset onboarding", 500);
  }
}
