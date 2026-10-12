/**
 * Cloudflare Workers Entry Point
 * Finance Manager - Multi-provider AI + Google Drive sync
 *
 * Handles routing, CORS, and request/response processing
 */

import type { CloudflareEnv } from "./lib/types";
import { buildResponse, buildErrorResponse, getCORSHeaders, log } from "./lib/utils";
import { AppErrorClass } from "./lib/utils";

// Import handlers
import { handleChat } from "./handlers/chat";
import { handleSync } from "./handlers/sync";
import { handleProfile } from "./handlers/profile";
import { handleAnalysis } from "./handlers/analysis";
import { handleAuthToken } from "./handlers/auth";

/**
 * CORS preflight handler
 */
function handleOptions(request: Request): Response {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    headers: {
      ...getCORSHeaders(origin),
      "Content-Length": "0",
    },
  });
}

/**
 * Route requests to appropriate handlers
 */
async function handleRequest(
  request: Request,
  env: CloudflareEnv,
  _ctx: any
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  log("info", `${method} ${pathname}`, {
    userAgent: request.headers.get("User-Agent"),
  });

  try {
    // Health check
    if (pathname === "/health" || pathname === "/api/health") {
      return buildResponse({
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: env.ENVIRONMENT,
      });
    }

    // OAuth token exchange endpoint
    if (pathname === "/api/auth/token" && method === "POST") {
      return await handleAuthToken(request, env);
    }

    // Chat endpoint
    if (pathname === "/api/chat" && method === "POST") {
      return await handleChat(request, env);
    }

    // Sync endpoint
    if (pathname === "/api/sync" && (method === "GET" || method === "POST")) {
      return await handleSync(request, env);
    }

    // Profile endpoints
    if (pathname.startsWith("/api/profile")) {
      return await handleProfile(request, env);
    }

    // Analysis endpoints
    if (pathname.startsWith("/api/analysis")) {
      return await handleAnalysis(request, env);
    }

    // OAuth callback
    if (pathname === "/auth/callback" && method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code || !state) {
        throw new AppErrorClass(
          "OAUTH_INVALID",
          "Missing code or state parameter",
          400
        );
      }

      // Store code temporarily and redirect to frontend
      // Frontend will exchange code for token
      return new Response(
        JSON.stringify({
          code,
          state,
          redirectUrl: `/?auth_code=${code}&auth_state=${state}`,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...getCORSHeaders(),
          },
        }
      );
    }

    // Frontend static files (served from Cloudflare Pages)
    if (
      pathname === "/" ||
      pathname.endsWith(".html") ||
      pathname.endsWith(".js") ||
      pathname.endsWith(".css")
    ) {
      // These should be served by Cloudflare Pages
      // This is a fallback for development
      return buildResponse(
        {
          error: "Static files should be served by Cloudflare Pages",
          url: pathname,
        },
        404
      );
    }

    // Not found
    return buildResponse(
      {
        error: "Not found",
        path: pathname,
        method,
      },
      404
    );
  } catch (error) {
    log("error", "Request handler error", { error });
    return buildErrorResponse(error);
  }
}

/**
 * Export the fetch handler for Cloudflare Workers
 */
export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: any
  ): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    try {
      const response = await handleRequest(request, env, ctx);

      // Add security headers
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      headers.set("X-XSS-Protection", "1; mode=block");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Permissions-Policy", "geolocation=(), microphone=()");

      // Add CORS headers
      const origin = request.headers.get("Origin");
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      log("error", "Unhandled error in fetch handler", { error });
      return buildErrorResponse(error, 500);
    }
  },

  /**
   * Handle scheduled events (periodic sync)
   */
  async scheduled(
    event: any,
    _env: CloudflareEnv,
    _ctx: any
  ): Promise<void> {
    log("info", "Scheduled event triggered", { cron: event.cron });

    try {
      // Clean up expired sessions every 6 hours
      // This would be implemented with KV namespace iteration
      log("info", "Running scheduled maintenance");
    } catch (error) {
      log("error", "Scheduled event error", { error });
    }
  },
};

// Type definitions for TypeScript support
export type { CloudflareEnv } from "./lib/types";

/**
 * Export API for local development
 */
export { handleChat, handleSync, handleProfile, handleAnalysis, handleAuthToken };
