/**
 * Schema Service
 * Handles schema validation, merging, and persistence
 */

import type {
  UserSchemaDefinition,
  OnboardingSession,
} from "../lib/types";
import { log } from "../lib/utils";
import { validateSchema } from "../utils/schemaValidator";

export class SchemaService {
  constructor(private db: any) {}

  /**
   * Get user's current schema from database
   */
  async getCurrentSchema(userId: string): Promise<UserSchemaDefinition | null> {
    try {
      const result = await this.db
        .prepare(
          "SELECT schema_data FROM user_schema_definitions WHERE user_id = ?"
        )
        .bind(userId)
        .first();

      if (!result) {
        return null;
      }

      return JSON.parse(result.schema_data);
    } catch (error) {
      log("error", "Error fetching current schema", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Create initial schema for new user
   */
  async createSchema(
    userId: string,
    schema: UserSchemaDefinition
  ): Promise<boolean> {
    try {
      // Validate schema
      const validation = validateSchema(schema);
      if (!validation.valid) {
        log("error", "Schema validation failed", {
          userId,
          errors: validation.errors,
        });
        return false;
      }

      const schemaId = `schema_${userId}_${Date.now()}`;
      const now = new Date().toISOString();

      await this.db
        .prepare(
          `
        INSERT INTO user_schema_definitions (id, user_id, schema_data, version, stage, completed_sections, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .bind(
          schemaId,
          userId,
          JSON.stringify(schema),
          1,
          "initial",
          JSON.stringify(this.getCompletedSections(schema)),
          now,
          now
        )
        .run();

      // Log audit trail
      await this.logAudit(userId, "schema_created", { schemaId });

      return true;
    } catch (error) {
      log("error", "Error creating schema", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Replace the given top-level fields of the existing schema (fields not sent are kept).
   * Used by form-based setup, where removing an item must stick — unlike the additive merge.
   */
  async replaceFields(
    userId: string,
    updates: Partial<UserSchemaDefinition>
  ): Promise<UserSchemaDefinition | null> {
    try {
      const currentSchema = await this.getCurrentSchema(userId);
      if (!currentSchema) return null;

      const allowed: Array<keyof UserSchemaDefinition> = [
        "residenceCountries",
        "accountTypes",
        "expenseCategories",
        "declaredGoals",
        "householdMembers",
        "investmentPreferences",
        "taxSettings",
      ];
      const next: UserSchemaDefinition = { ...currentSchema };
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          (next as any)[key] = updates[key];
        }
      }

      const validation = validateSchema(next);
      if (!validation.valid) {
        log("error", "Replaced schema validation failed", { userId, errors: validation.errors });
        return null;
      }

      const now = new Date().toISOString();
      await this.db
        .prepare(
          `
        UPDATE user_schema_definitions
        SET schema_data = ?, version = version + 1, completed_sections = ?, updated_at = ?
        WHERE user_id = ?
      `
        )
        .bind(JSON.stringify(next), JSON.stringify(this.getCompletedSections(next)), now, userId)
        .run();

      await this.logAudit(userId, "schema_updated", {
        mode: "replace",
        fields: Object.keys(updates).filter((k) => allowed.includes(k as keyof UserSchemaDefinition)),
      });
      return next;
    } catch (error) {
      log("error", "Error replacing schema fields", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Merge new schema updates with existing schema
   * Strategy: Additive updates, preserve existing data, no overwrites unless explicitly provided
   */
  async mergeSchema(
    userId: string,
    updates: Partial<UserSchemaDefinition>
  ): Promise<UserSchemaDefinition | null> {
    try {
      const currentSchema = await this.getCurrentSchema(userId);

      if (!currentSchema) {
        // If no existing schema, create new one with updates
        return await this.createSchema(userId, updates as UserSchemaDefinition)
          ? (updates as UserSchemaDefinition)
          : null;
      }

      // Merge strategies per field
      const mergedSchema: UserSchemaDefinition = {
        // Arrays: merge and deduplicate
        residenceCountries: [
          ...new Set([
            ...currentSchema.residenceCountries,
            ...(updates.residenceCountries || []),
          ]),
        ],

        accountTypes: [
          ...new Set([
            ...currentSchema.accountTypes,
            ...(updates.accountTypes || []),
          ]),
        ],

        expenseCategories: [
          ...new Set([
            ...currentSchema.expenseCategories,
            ...(updates.expenseCategories || []),
          ]),
        ],

        // Optional fields: merge or add if not present
        declaredGoals: this.mergeArrayField(
          currentSchema.declaredGoals,
          updates.declaredGoals
        ),

        householdMembers: this.mergeObjectArrayField(
          currentSchema.householdMembers,
          updates.householdMembers
        ),

        investmentPreferences: this.mergeObjectField(
          currentSchema.investmentPreferences,
          updates.investmentPreferences
        ) as { hasInvestments: boolean; types?: string[] | undefined; } | undefined,

        taxSettings: this.mergeObjectField(
          currentSchema.taxSettings,
          updates.taxSettings
        ) as { country: string; fillingStatus?: string | undefined; } | undefined,
      };

      // Validate merged schema
      const validation = validateSchema(mergedSchema);
      if (!validation.valid) {
        log("error", "Merged schema validation failed", {
          userId,
          errors: validation.errors,
        });
        return null;
      }

      // Update database
      const now = new Date().toISOString();
      await this.db
        .prepare(
          `
        UPDATE user_schema_definitions
        SET schema_data = ?, version = version + 1, completed_sections = ?, updated_at = ?
        WHERE user_id = ?
      `
        )
        .bind(
          JSON.stringify(mergedSchema),
          JSON.stringify(this.getCompletedSections(mergedSchema)),
          now,
          userId
        )
        .run();

      // Log audit trail
      await this.logAudit(userId, "schema_updated", {
        updates: Object.keys(updates),
      });

      return mergedSchema;
    } catch (error) {
      log("error", "Error merging schema", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Helper: Merge array fields (deduplicate)
   */
  private mergeArrayField(
    current: string[] | undefined,
    updates: string[] | undefined
  ): string[] | undefined {
    if (!current && !updates) return undefined;

    const all = [
      ...(current || []),
      ...(updates || []),
    ];

    return all.length > 0 ? [...new Set(all)] : undefined;
  }

  /**
   * Helper: Merge object array fields (by identifying key)
   */
  private mergeObjectArrayField(
    current: Array<any> | undefined,
    updates: Array<any> | undefined
  ): Array<any> | undefined {
    if (!current && !updates) return undefined;

    const map = new Map();

    // Add current items
    (current || []).forEach((item) => {
      const key = item.name || JSON.stringify(item);
      map.set(key, item);
    });

    // Add/overwrite with updates
    (updates || []).forEach((item) => {
      const key = item.name || JSON.stringify(item);
      map.set(key, item);
    });

    const result = Array.from(map.values());
    return result.length > 0 ? result : undefined;
  }

  /**
   * Helper: Merge object fields (shallow merge)
   */
  private mergeObjectField(
    current: Record<string, any> | undefined,
    updates: Record<string, any> | undefined
  ): Record<string, any> | undefined {
    if (!current && !updates) return undefined;

    return {
      ...current,
      ...updates,
    };
  }

  /**
   * Determine completed sections based on schema data
   */
  private getCompletedSections(schema: UserSchemaDefinition): string[] {
    const completed: string[] = [];

    if (schema.residenceCountries?.length > 0) {
      completed.push("countries");
    }

    if (schema.accountTypes?.length > 0) {
      completed.push("accounts");
    }

    if (schema.expenseCategories?.length > 0) {
      completed.push("categories");
    }

    if (schema.declaredGoals && schema.declaredGoals.length > 0) {
      completed.push("goals");
    }

    if (schema.householdMembers && schema.householdMembers.length > 0) {
      completed.push("household");
    }

    if (schema.investmentPreferences?.hasInvestments) {
      completed.push("investments");
    }

    if (schema.taxSettings) {
      completed.push("tax");
    }

    return completed;
  }

  /**
   * Log audit entry for compliance and debugging
   */
  private async logAudit(
    userId: string,
    action: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const auditId = `audit_${userId}_${Date.now()}`;
      const now = new Date().toISOString();

      await this.db
        .prepare(
          `
        INSERT INTO onboarding_audit_log (id, user_id, action, details, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .bind(auditId, userId, action, JSON.stringify(details || {}), now)
        .run();
    } catch (error) {
      log("warn", "Error logging audit trail", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Don't throw - audit logging shouldn't block main flow
    }
  }

  /**
   * Get schema status (for /api/onboarding/status)
   */
  async getSchemaStatus(userId: string) {
    try {
      const result = await this.db
        .prepare(
          `
        SELECT schema_data, stage, completed_sections
        FROM user_schema_definitions
        WHERE user_id = ?
      `
        )
        .bind(userId)
        .first();

      if (!result) {
        return {
          hasSchema: false,
          stage: null,
          redirectTo: "first-login-onboarding" as const,
        };
      }

      return {
        hasSchema: true,
        stage: result.stage,
        completedSections: JSON.parse(result.completed_sections),
        redirectTo: null,
      };
    } catch (error) {
      log("error", "Error getting schema status", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return {
        hasSchema: false,
        stage: null,
        redirectTo: "first-login-onboarding" as const,
      };
    }
  }

  /**
   * Create onboarding session record
   */
  async createSession(
    userId: string,
    type: "initial" | "progressive",
    focus?: string
  ): Promise<OnboardingSession | null> {
    try {
      const sessionId = `session_${userId}_${Date.now()}`;
      const now = new Date().toISOString();

      // Fetch current schema as snapshot
      const currentSchema = await this.getCurrentSchema(userId);

      await this.db
        .prepare(
          `
        INSERT INTO onboarding_sessions (id, user_id, type, focus, messages, schema_snapshot, status, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .bind(
          sessionId,
          userId,
          type,
          focus || null,
          JSON.stringify([]),
          currentSchema ? JSON.stringify(currentSchema) : null,
          "in_progress",
          now
        )
        .run();

      return {
        id: sessionId,
        userId,
        type,
        focus: focus as any,
        messages: [],
        schemaSnapshot: currentSchema || undefined,
        status: "in_progress",
        createdAt: now,
      };
    } catch (error) {
      log("error", "Error creating session", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Update session messages
   */
  async updateSessionMessages(
    sessionId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<boolean> {
    try {
      await this.db
        .prepare(
          "UPDATE onboarding_sessions SET messages = ? WHERE id = ?"
        )
        .bind(JSON.stringify(messages), sessionId)
        .run();

      return true;
    } catch (error) {
      log("error", "Error updating session messages", {
        sessionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /**
   * Complete session
   */
  async completeSession(
    sessionId: string,
    proposedSchema: Partial<UserSchemaDefinition>
  ): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      await this.db
        .prepare(
          `
        UPDATE onboarding_sessions
        SET status = 'completed', schema_proposed = ?, completed_at = ?
        WHERE id = ?
      `
        )
        .bind(JSON.stringify(proposedSchema), now, sessionId)
        .run();

      return true;
    } catch (error) {
      log("error", "Error completing session", {
        sessionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }
}
