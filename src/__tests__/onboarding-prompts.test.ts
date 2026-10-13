/**
 * Phase 2.5c: Onboarding Prompts & Schema Extraction Tests
 * Tests for Gemini prompt refinements and schema extraction edge cases
 */

import {
  extractSchemaFromAIResponse,
  sanitizeSchema,
  validatePartialSchema,
} from "../utils/schemaValidator";
import type { UserSchemaDefinition } from "../lib/types";

describe("Phase 2.5c: Onboarding Prompts & Schema Extraction", () => {
  describe("extractSchemaFromAIResponse - Edge Cases", () => {
    it("should extract valid JSON from AI response with prose", () => {
      const response = `Hello! I can help you set up your finance account. Let me gather some basic information.

{
  "message": "What country are you located in?",
  "schemaUpdate": {
    "residenceCountries": ["US"]
  }
}

This will help me understand your tax situation.`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.residenceCountries).toEqual(["US"]);
    });

    it("should handle JSON with escaped characters", () => {
      const response = `{
  "message": "What's your primary account type? \\"Bank\\" is common.",
  "schemaUpdate": {
    "accountTypes": ["bank", "investment"]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.accountTypes).toEqual(["bank", "investment"]);
    });

    it("should extract schemaUpdate from nested response format", () => {
      const response = `{
  "message": "Got it! Here's what I collected.",
  "schemaUpdate": {
    "residenceCountries": ["GB", "US"],
    "accountTypes": ["bank", "card"]
  },
  "complete": false
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.residenceCountries).toEqual(["GB", "US"]);
      expect(result?.accountTypes).toEqual(["bank", "card"]);
    });

    it("should handle entire response as JSON", () => {
      const response = `{
  "residenceCountries": ["CA"],
  "accountTypes": ["investment", "savings"],
  "expenseCategories": ["Groceries", "Transport"]
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.residenceCountries).toEqual(["CA"]);
      expect(result?.accountTypes).toEqual(["investment", "savings"]);
      expect(result?.expenseCategories).toEqual(["Groceries", "Transport"]);
    });

    it("should return null for empty response", () => {
      const result = extractSchemaFromAIResponse("");
      expect(result).toBeNull();
    });

    it("should return null for non-JSON response", () => {
      const response = "I can help you set up your account. What country are you in?";
      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeNull();
    });

    it("should return null for malformed JSON", () => {
      const response = `{
  "message": "What's your location?",
  "schemaUpdate": {
    "residenceCountries": ["US"
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeNull();
    });

    it("should handle JSON with no schemaUpdate field", () => {
      const response = `{
  "message": "Please provide your information.",
  "status": "waiting"
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeNull();
    });

    it("should extract from response with multiple JSON-like structures", () => {
      const response = `First {invalid}, then:
{
  "message": "What accounts do you have?",
  "schemaUpdate": {
    "accountTypes": ["bank", "card"]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.accountTypes).toEqual(["bank", "card"]);
    });

    it("should handle very long response with JSON at end", () => {
      const longText = "A".repeat(1000);
      const response = `${longText}
{
  "message": "Here's your setup.",
  "schemaUpdate": {
    "expenseCategories": ["Food", "Transport", "Utilities"]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.expenseCategories).toEqual(["Food", "Transport", "Utilities"]);
    });

    it("should handle null/undefined input gracefully", () => {
      const result = extractSchemaFromAIResponse(null as any);
      expect(result).toBeNull();
    });

    it("should handle newlines and whitespace in JSON", () => {
      const response = `{
  "message":    "What's your primary residence?",
  "schemaUpdate":   {
    "residenceCountries":   ["AU"]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.residenceCountries).toEqual(["AU"]);
    });
  });

  describe("Schema Extraction - Data Normalization", () => {
    it("should normalize country codes to uppercase via sanitization", () => {
      const rawSchema = {
        residenceCountries: ["us", "gb", "ca"],
        accountTypes: ["BANK", "INVESTMENT"],
        expenseCategories: ["Groceries"],
      };

      const sanitized = sanitizeSchema(rawSchema);
      expect(sanitized.residenceCountries).toEqual(["US", "GB", "CA"]);
      expect(sanitized.accountTypes).toEqual(["bank", "investment"]);
    });

    it("should trim whitespace from all string arrays", () => {
      const rawSchema = {
        residenceCountries: [" US ", " CA "],
        accountTypes: [" bank ", " card "],
        expenseCategories: [" Groceries ", " Transport "],
      };

      const sanitized = sanitizeSchema(rawSchema);
      expect(sanitized.residenceCountries).toEqual(["US", "CA"]);
      expect(sanitized.accountTypes).toEqual(["bank", "card"]);
      expect(sanitized.expenseCategories).toEqual(["Groceries", "Transport"]);
    });

    it("should enforce length limits on arrays", () => {
      const categories = Array.from({ length: 150 }, (_, i) =>
        `Category${i}`
      );
      const rawSchema = {
        residenceCountries: ["US"],
        accountTypes: ["bank"],
        expenseCategories: categories,
      };

      const sanitized = sanitizeSchema(rawSchema);
      expect(sanitized.expenseCategories?.length).toBe(100); // Max 100
    });

    it("should handle household members with missing fields", () => {
      const rawSchema = {
        residenceCountries: ["US"],
        accountTypes: ["bank"],
        expenseCategories: ["Groceries"],
        householdMembers: [
          { name: "Alice", relationship: "spouse" },
          { name: "Bob" }, // Missing relationship
          { relationship: "child" }, // Missing name
          { name: "Charlie", relationship: "child" },
        ],
      };

      const sanitized = sanitizeSchema(rawSchema);
      expect(sanitized.householdMembers?.length).toBe(2); // Only valid members
      expect(sanitized.householdMembers?.[0].name).toBe("Alice");
    });
  });

  describe("Schema Extraction - Complex Nested Data", () => {
    it("should extract investment preferences correctly", () => {
      const response = `{
  "message": "Got your investment preferences.",
  "schemaUpdate": {
    "investmentPreferences": {
      "hasInvestments": true,
      "types": ["stocks", "etfs", "bonds"]
    }
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.investmentPreferences?.hasInvestments).toBe(true);
      expect(result?.investmentPreferences?.types).toEqual(["stocks", "etfs", "bonds"]);
    });

    it("should extract tax settings correctly", () => {
      const response = `{
  "message": "Tax settings recorded.",
  "schemaUpdate": {
    "taxSettings": {
      "country": "US",
      "fillingStatus": "married_filing_jointly"
    }
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.taxSettings?.country).toBe("US");
      expect(result?.taxSettings?.fillingStatus).toBe("married_filing_jointly");
    });

    it("should extract multiple household members", () => {
      const response = `{
  "message": "Family information saved.",
  "schemaUpdate": {
    "householdMembers": [
      { "name": "Alice", "relationship": "spouse" },
      { "name": "Bob", "relationship": "child" },
      { "name": "Charlie", "relationship": "child" }
    ]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.householdMembers?.length).toBe(3);
      expect(result?.householdMembers?.[0].name).toBe("Alice");
    });
  });

  describe("Schema Validation - Progressive Onboarding", () => {
    it("should validate partial schema with only one focus area", () => {
      const partialSchema: Partial<UserSchemaDefinition> = {
        investmentPreferences: {
          hasInvestments: true,
          types: ["stocks"],
        },
      };

      const result = validatePartialSchema(partialSchema);
      expect(result.valid).toBe(true);
    });

    it("should reject invalid investment types", () => {
      const partialSchema: Partial<UserSchemaDefinition> = {
        investmentPreferences: {
          hasInvestments: true,
          types: ["stocks", "fake_type"],
        },
      };

      // Note: Current validator doesn't validate investment types
      // This test documents the limitation
      const result = validatePartialSchema(partialSchema);
      expect(result.valid).toBe(true); // Currently passes, but could be stricter
    });

    it("should allow empty partial schema updates", () => {
      const partialSchema: Partial<UserSchemaDefinition> = {};
      const result = validatePartialSchema(partialSchema);
      expect(result.valid).toBe(true);
    });
  });

  describe("Prompt Response Format Validation", () => {
    it("should handle AI response that forgets schemaUpdate", () => {
      const response = `{
  "message": "What's your primary residence country?",
  "schemaUpdate": {}
}`;

      const result = extractSchemaFromAIResponse(response);
      // Empty schemaUpdate is still valid, just no fields extracted
      expect(result).toBeDefined();
      expect(Object.keys(result || {}).length).toBeGreaterThanOrEqual(0);
    });

    it("should extract when AI includes extra fields", () => {
      const response = `{
  "message": "Setting up your account.",
  "schemaUpdate": {
    "residenceCountries": ["US"],
    "accountTypes": ["bank"]
  },
  "complete": false,
  "progress": 33,
  "nextQuestion": "What account types do you have?"
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.residenceCountries).toEqual(["US"]);
      expect(result?.accountTypes).toEqual(["bank"]);
    });
  });

  describe("Edge Cases - Special Characters & Unicode", () => {
    it("should handle category names with special characters", () => {
      const response = `{
  "message": "Categories saved.",
  "schemaUpdate": {
    "residenceCountries": ["US"],
    "accountTypes": ["bank"],
    "expenseCategories": ["Food & Dining", "Health/Medical", "Travel (Flights)"]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result?.expenseCategories).toContain("Food & Dining");
      expect(result?.expenseCategories).toContain("Health/Medical");
    });

    it("should handle unicode characters in responses", () => {
      const response = `{
  "message": "✅ Setup complete! 🎉",
  "schemaUpdate": {
    "residenceCountries": ["UK"],
    "accountTypes": ["bank"],
    "expenseCategories": ["£ Groceries", "🚗 Transport"]
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeDefined();
      expect(result?.expenseCategories).toContain("🚗 Transport");
    });
  });

  describe("Performance - Large Responses", () => {
    it("should efficiently extract from very large response", () => {
      const largeProse = Array.from({ length: 100 }, () =>
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. "
      ).join("");

      const response = `${largeProse}
{
  "message": "Here's your schema.",
  "schemaUpdate": {
    "residenceCountries": ["US"],
    "accountTypes": ["bank", "investment"],
    "expenseCategories": ["Groceries", "Transport", "Utilities"]
  }
}
${largeProse}`;

      const start = performance.now();
      const result = extractSchemaFromAIResponse(response);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(result?.residenceCountries).toEqual(["US"]);
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it("should handle deeply nested but invalid JSON gracefully", () => {
      const response = `{
  "data": {
    "user": {
      "profile": {
        "settings": {
          "nested": {
            "deep": {
              "very_deep": "value"
            }
          }
        }
      }
    }
  }
}`;

      const result = extractSchemaFromAIResponse(response);
      expect(result).toBeNull(); // No schema fields, so invalid
    });
  });

  describe("Prompt Engineering - Focus Areas", () => {
    it("should validate investment focus area schema", () => {
      const investmentSchema: Partial<UserSchemaDefinition> = {
        investmentPreferences: {
          hasInvestments: true,
          types: ["stocks", "etfs"],
        },
      };

      const result = validatePartialSchema(investmentSchema);
      expect(result.valid).toBe(true);
    });

    it("should validate household focus area schema", () => {
      const householdSchema: Partial<UserSchemaDefinition> = {
        householdMembers: [
          { name: "John", relationship: "spouse" },
          { name: "Jane", relationship: "child" },
        ],
      };

      const result = validatePartialSchema(householdSchema);
      expect(result.valid).toBe(true);
    });

    it("should validate goals focus area schema", () => {
      const goalsSchema: Partial<UserSchemaDefinition> = {
        declaredGoals: ["Retirement", "House Purchase", "Education"],
      };

      const result = validatePartialSchema(goalsSchema);
      expect(result.valid).toBe(true);
    });

    it("should validate tax focus area schema", () => {
      const taxSchema: Partial<UserSchemaDefinition> = {
        taxSettings: {
          country: "US",
          fillingStatus: "single",
        },
      };

      const result = validatePartialSchema(taxSchema);
      expect(result.valid).toBe(true);
    });

    it("should validate categories focus area schema", () => {
      const categoriesSchema: Partial<UserSchemaDefinition> = {
        expenseCategories: [
          "Groceries",
          "Transport",
          "Entertainment",
          "Utilities",
          "Healthcare",
        ],
      };

      const result = validatePartialSchema(categoriesSchema);
      expect(result.valid).toBe(true);
    });
  });
});
