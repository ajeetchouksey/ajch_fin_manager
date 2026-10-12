/**
 * OAuth Authentication Handler
 * Handles Google OAuth code exchange for access tokens
 */

import type { CloudflareEnv } from "../lib/types";
import { buildResponse, buildErrorResponse, log } from "../lib/utils";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function handleAuthToken(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  if (request.method !== "POST") {
    return buildErrorResponse("Method not allowed", 405);
  }

  try {
    const { code, redirectUri } = (await request.json()) as {
      code?: string;
      redirectUri?: string;
    };

    if (!code) {
      return buildErrorResponse("Missing authorization code", 400);
    }

    if (!redirectUri) {
      return buildErrorResponse("Missing redirect URI", 400);
    }

    // Get Google OAuth credentials from environment
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      log("error", "Missing Google OAuth credentials in environment");
      return buildErrorResponse("Server misconfiguration", 500);
    }

    // Exchange code for access token
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      log("error", "Google token exchange failed", { error });
      return buildErrorResponse(
        "Failed to exchange code for token",
        tokenResponse.status
      );
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      expires_in: number;
      scope: string;
      token_type: string;
      id_token?: string;
    };

    // Return access token to frontend
    return buildResponse({
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log("error", "Auth token handler error", { message });
    return buildErrorResponse("Internal server error", 500);
  }
}
