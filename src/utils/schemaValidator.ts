/**
 * Schema Validator
 * Validates UserSchemaDefinition objects
 */

import type { UserSchemaDefinition } from "../lib/types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate complete UserSchemaDefinition
 */
export function validateSchema(schema: any): ValidationResult {
  const errors: string[] = [];

  // Type check
  if (!schema || typeof schema !== "object") {
    return {
      valid: false,
      errors: ["Schema must be an object"],
    };
  }

  // Required fields
  if (!Array.isArray(schema.residenceCountries)) {
    errors.push("residenceCountries must be an array");
  } else if (schema.residenceCountries.length === 0) {
    errors.push("residenceCountries cannot be empty");
  } else {
    // Validate country codes
    const invalidCountries = schema.residenceCountries.filter(
      (c: any) =>
        typeof c !== "string" ||
        c.length < 2 ||
        c.length > 3 ||
        /[^A-Z]/.test(c)
    );
    if (invalidCountries.length > 0) {
      errors.push(`Invalid country codes: ${invalidCountries.join(", ")}`);
    }
  }

  if (!Array.isArray(schema.accountTypes)) {
    errors.push("accountTypes must be an array");
  } else if (schema.accountTypes.length === 0) {
    errors.push("accountTypes cannot be empty");
  } else {
    // Validate account type strings
    const validTypes = [
      "bank",
      "card",
      "investment",
      "savings",
      "crypto",
      "other",
    ];
    const invalidTypes = schema.accountTypes.filter(
      (t: any) => typeof t !== "string" || !validTypes.includes(t.toLowerCase())
    );
    if (invalidTypes.length > 0) {
      errors.push(
        `Invalid account types: ${invalidTypes.join(", ")}. Valid: ${validTypes.join(", ")}`
      );
    }
  }

  if (!Array.isArray(schema.expenseCategories)) {
    errors.push("expenseCategories must be an array");
  } else if (schema.expenseCategories.length === 0) {
    errors.push("expenseCategories cannot be empty");
  } else {
    // Validate category strings (non-empty, reasonable length)
    const invalidCategories = schema.expenseCategories.filter(
      (c: any) =>
        typeof c !== "string" || c.trim().length === 0 || c.length > 100
    );
    if (invalidCategories.length > 0) {
      errors.push(
        `Invalid categories: categories must be non-empty strings (max 100 chars)`
      );
    }
  }

  // Optional fields with validation
  if (schema.declaredGoals !== undefined) {
    if (!Array.isArray(schema.declaredGoals)) {
      errors.push("declaredGoals must be an array");
    } else {
      const invalidGoals = schema.declaredGoals.filter(
        (g: any) => typeof g !== "string" || g.trim().length === 0
      );
      if (invalidGoals.length > 0) {
        errors.push("declaredGoals must contain non-empty strings");
      }
    }
  }

  if (schema.householdMembers !== undefined) {
    if (!Array.isArray(schema.householdMembers)) {
      errors.push("householdMembers must be an array");
    } else {
      schema.householdMembers.forEach((member: any, idx: number) => {
        if (typeof member !== "object" || !member.name || !member.relationship) {
          errors.push(
            `householdMembers[${idx}] must have 'name' and 'relationship'`
          );
        }
      });
    }
  }

  if (schema.investmentPreferences !== undefined) {
    if (typeof schema.investmentPreferences !== "object") {
      errors.push("investmentPreferences must be an object");
    } else {
      if (
        schema.investmentPreferences.hasInvestments !== undefined &&
        typeof schema.investmentPreferences.hasInvestments !== "boolean"
      ) {
        errors.push("investmentPreferences.hasInvestments must be a boolean");
      }
      if (schema.investmentPreferences.types !== undefined) {
        if (!Array.isArray(schema.investmentPreferences.types)) {
          errors.push("investmentPreferences.types must be an array");
        }
      }
    }
  }

  if (schema.taxSettings !== undefined) {
    if (typeof schema.taxSettings !== "object") {
      errors.push("taxSettings must be an object");
    } else {
      if (!schema.taxSettings.country || typeof schema.taxSettings.country !== "string") {
        errors.push("taxSettings.country must be a non-empty string");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate partial schema (for updates)
 */
export function validatePartialSchema(
  schema: Partial<UserSchemaDefinition>
): ValidationResult {
  const errors: string[] = [];

  // Only validate fields that are provided
  if (schema.residenceCountries !== undefined) {
    if (!Array.isArray(schema.residenceCountries)) {
      errors.push("residenceCountries must be an array");
    } else if (schema.residenceCountries.length > 0) {
      const invalidCountries = schema.residenceCountries.filter(
        (c: any) =>
          typeof c !== "string" ||
          c.length < 2 ||
          c.length > 3 ||
          /[^A-Z]/.test(c)
      );
      if (invalidCountries.length > 0) {
        errors.push(`Invalid country codes: ${invalidCountries.join(", ")}`);
      }
    }
  }

  if (schema.accountTypes !== undefined) {
    if (!Array.isArray(schema.accountTypes)) {
      errors.push("accountTypes must be an array");
    } else if (schema.accountTypes.length > 0) {
      const validTypes = [
        "bank",
        "card",
        "investment",
        "savings",
        "crypto",
        "other",
      ];
      const invalidTypes = schema.accountTypes.filter(
        (t: any) =>
          typeof t !== "string" || !validTypes.includes(t.toLowerCase())
      );
      if (invalidTypes.length > 0) {
        errors.push(
          `Invalid account types: ${invalidTypes.join(", ")}. Valid: ${validTypes.join(", ")}`
        );
      }
    }
  }

  if (schema.expenseCategories !== undefined) {
    if (!Array.isArray(schema.expenseCategories)) {
      errors.push("expenseCategories must be an array");
    } else if (schema.expenseCategories.length > 0) {
      const invalidCategories = schema.expenseCategories.filter(
        (c: any) =>
          typeof c !== "string" || c.trim().length === 0 || c.length > 100
      );
      if (invalidCategories.length > 0) {
        errors.push(
          `Invalid categories: categories must be non-empty strings (max 100 chars)`
        );
      }
    }
  }

  // Validate optional fields similarly...
  if (schema.declaredGoals !== undefined && Array.isArray(schema.declaredGoals)) {
    const invalidGoals = schema.declaredGoals.filter(
      (g: any) => typeof g !== "string" || g.trim().length === 0
    );
    if (invalidGoals.length > 0) {
      errors.push("declaredGoals must contain non-empty strings");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract schema from AI response text
 * Attempts to parse JSON from AI response with improved error handling
 * Handles multiple JSON objects, nested structures, and edge cases
 */
export function extractSchemaFromAIResponse(
  response: string
): Partial<UserSchemaDefinition> | null {
  if (!response || typeof response !== "string") {
    return null;
  }

  try {
    // Strategy 1: Try to parse the entire response as JSON first
    try {
      const entireJson = JSON.parse(response);
      if (isValidSchemaObject(entireJson)) {
        return entireJson;
      }
    } catch (e) {
      // Not valid JSON, continue to next strategy
    }

    // Strategy 2: Find all JSON objects in the response and try each one
    // This handles cases where there are multiple JSON-like structures
    let currentIndex = 0;
    while (currentIndex < response.length) {
      const openBraceIndex = response.indexOf("{", currentIndex);
      if (openBraceIndex === -1) {
        break;
      }

      let braceCount = 0;
      let jsonEndIndex = -1;
      for (let i = openBraceIndex; i < response.length; i++) {
        if (response[i] === "{") braceCount++;
        else if (response[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            jsonEndIndex = i;
            break;
          }
        }
      }

      if (jsonEndIndex === -1) {
        break;
      }

      try {
        const potentialJson = response.substring(openBraceIndex, jsonEndIndex + 1);
        const parsed = JSON.parse(potentialJson);

        if (isValidSchemaObject(parsed)) {
          return parsed;
        }

        // Check if parsed object has a schemaUpdate field
        if (parsed && typeof parsed.schemaUpdate === "object") {
          const schemaUpdate = parsed.schemaUpdate;
          if (isValidSchemaObject(schemaUpdate)) {
            return schemaUpdate;
          }
        }
      } catch (e) {
        // This JSON object was invalid, try the next one
      }

      // Move past this JSON object for next iteration
      currentIndex = jsonEndIndex + 1;
    }
  } catch (e) {
    // JSON parse failed, return null
    // Log for debugging: console.error("Failed to extract schema:", e);
  }

  return null;
}

/**
 * Check if an object looks like a valid schema update
 */
function isValidSchemaObject(obj: any): boolean {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  // Check for at least one schema field
  const schemaFields = [
    "residenceCountries",
    "accountTypes",
    "expenseCategories",
    "declaredGoals",
    "householdMembers",
    "investmentPreferences",
    "taxSettings",
  ];

  return schemaFields.some((field) => field in obj);
}

/**
 * Sanitize schema data (prevent injection, normalize)
 */
export function sanitizeSchema(
  schema: any
): Partial<UserSchemaDefinition> {
  const sanitized: any = {};

  // Sanitize arrays
  if (Array.isArray(schema.residenceCountries)) {
    sanitized.residenceCountries = schema.residenceCountries
      .filter((c: any) => typeof c === "string")
      .map((c: string) => c.toUpperCase().trim())
      .slice(0, 50); // Max 50 countries
  }

  if (Array.isArray(schema.accountTypes)) {
    sanitized.accountTypes = schema.accountTypes
      .filter((t: any) => typeof t === "string")
      .map((t: string) => t.toLowerCase().trim())
      .slice(0, 50);
  }

  if (Array.isArray(schema.expenseCategories)) {
    sanitized.expenseCategories = schema.expenseCategories
      .filter((c: any) => typeof c === "string")
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 0 && c.length <= 100)
      .slice(0, 100); // Max 100 categories
  }

  if (Array.isArray(schema.declaredGoals)) {
    sanitized.declaredGoals = schema.declaredGoals
      .filter((g: any) => typeof g === "string")
      .map((g: string) => g.trim())
      .filter((g: string) => g.length > 0 && g.length <= 200)
      .slice(0, 50);
  }

  if (Array.isArray(schema.householdMembers)) {
    sanitized.householdMembers = schema.householdMembers
      .filter(
        (m: any) =>
          typeof m === "object" &&
          typeof m.name === "string" &&
          typeof m.relationship === "string"
      )
      .map((m: any) => ({
        name: m.name.trim().slice(0, 100),
        relationship: m.relationship.trim().slice(0, 50),
      }))
      .slice(0, 20);
  }

  if (typeof schema.investmentPreferences === "object") {
    sanitized.investmentPreferences = {
      hasInvestments:
        typeof schema.investmentPreferences.hasInvestments === "boolean"
          ? schema.investmentPreferences.hasInvestments
          : false,
    };

    if (Array.isArray(schema.investmentPreferences.types)) {
      sanitized.investmentPreferences.types = schema.investmentPreferences.types
        .filter((t: any) => typeof t === "string")
        .map((t: string) => t.trim())
        .slice(0, 50);
    }
  }

  if (typeof schema.taxSettings === "object") {
    sanitized.taxSettings = {};
    if (typeof schema.taxSettings.country === "string") {
      sanitized.taxSettings.country = schema.taxSettings.country
        .toUpperCase()
        .trim()
        .slice(0, 3);
    }
    if (typeof schema.taxSettings.fillingStatus === "string") {
      sanitized.taxSettings.fillingStatus = schema.taxSettings.fillingStatus
        .trim()
        .slice(0, 100);
    }
  }

  return sanitized;
}
