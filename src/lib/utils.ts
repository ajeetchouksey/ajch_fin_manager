/**
 * Utility functions for Finance Manager
 * Includes logging, hashing, formatting, and error handling
 */

import type { AppError, CloudflareEnv } from "./types";

export class AppErrorClass extends Error implements AppError {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppErrorClass.prototype);
  }
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a string using SHA-256
 */
export async function hashString(data: string): Promise<string> {
  const buffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format currency with proper symbols and decimals
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD"
): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  });
  return formatter.format(amount);
}

/**
 * Parse currency string back to number
 */
export function parseCurrency(value: string): number {
  // Remove currency symbols and spaces, keep minus sign
  const cleaned = value.replace(/[^\d.-]/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Format date to ISO string
 */
export function toISODate(date: Date | string): string {
  if (typeof date === "string") {
    return new Date(date).toISOString();
  }
  return date.toISOString();
}

/**
 * Get current timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Check if token is expired
 */
export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Generate expiration timestamp (default: 24 hours from now)
 */
export function getExpiration(hours: number = 24): string {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

/**
 * Validate HTTP methods
 */
export function isValidMethod(
  method: unknown,
  allowed: string[]
): method is string {
  return typeof method === "string" && allowed.includes(method.toUpperCase());
}

/**
 * Parse and validate JSON
 */
export function parseJSON<T>(data: string, defaultValue?: T): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

/**
 * Check for required environment variables
 */
export function validateEnv(
  env: CloudflareEnv,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter(
    (key) => !env[key as keyof CloudflareEnv]
  );
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Rate limit check
 */
export function checkRateLimit(
  requestCount: number,
  limit: number,
  windowMs: number,
  lastReset: number
): boolean {
  const now = Date.now();
  if (now - lastReset > windowMs) {
    return true; // Window reset, allow
  }
  return requestCount < limit;
}

/**
 * Calculate pagination offset
 */
export function calculateOffset(
  page: number = 1,
  pageSize: number = 20
): number {
  return Math.max(0, (page - 1) * pageSize);
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Encode string to base64
 */
export function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Decode base64 to string
 */
export function fromBase64(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

/**
 * Create CORS headers
 */
export function getCORSHeaders(origin: string = "*"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Session-Token",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Build response with proper headers
 */
export function buildResponse(
  body: unknown,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCORSHeaders(),
      ...headers,
    },
  });
}

/**
 * Build error response
 */
export function buildErrorResponse(
  error: AppErrorClass | Error | unknown,
  defaultStatus: number = 500
): Response {
  if (error instanceof AppErrorClass) {
    return buildResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      error.statusCode
    );
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  return buildResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
    },
    defaultStatus
  );
}

/**
 * Log function (respects environment)
 */
export function log(
  level: "info" | "warn" | "error" | "debug",
  message: string,
  data?: unknown
): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (typeof console !== "undefined") {
    if (data) {
      console[level === "warn" ? "warn" : level === "error" ? "error" : "log"](
        prefix,
        message,
        data
      );
    } else {
      console[level === "warn" ? "warn" : level === "error" ? "error" : "log"](
        prefix,
        message
      );
    }
  }
}
