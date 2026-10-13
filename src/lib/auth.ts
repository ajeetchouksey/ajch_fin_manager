/**
 * Request authentication (ADR-001, Increment 0).
 *
 * Every protected /api route derives the caller's identity from a VERIFIED Google
 * access token — never from a client-supplied id. Verification uses Google's
 * tokeninfo endpoint and checks the token was issued to OUR OAuth client
 * (aud/azp), which stops tokens minted for other apps being replayed here.
 * Results are cached in KV (keyed by a SHA-256 of the token, never the token
 * itself) until shortly before the token expires.
 */

import type { CloudflareEnv } from "./types";
import { log } from "./utils";

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const CACHE_PREFIX = "auth:v1:";
const KV_MIN_TTL = 60; // Cloudflare KV minimum expirationTtl

export interface AuthIdentity {
  userId: string; // Google subject id (same value the frontend gets as userinfo "id")
  email?: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface TokenInfo {
  sub?: string;
  aud?: string;
  azp?: string;
  email?: string;
  expires_in?: string | number;
  error_description?: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Verify the caller. Throws AuthError (401 missing/invalid/expired, 403 mismatch).
 */
export async function authenticate(
  request: Request,
  env: Pick<CloudflareEnv, "GOOGLE_CLIENT_ID" | "SESSIONS">,
  fetchImpl: typeof fetch = fetch
): Promise<AuthIdentity> {
  const token = bearerToken(request);
  if (!token) throw new AuthError("Sign-in required");

  const cacheKey = CACHE_PREFIX + (await sha256Hex(token));
  let identity: AuthIdentity | null = null;

  try {
    const cached = env.SESSIONS ? await env.SESSIONS.get(cacheKey) : null;
    if (cached) identity = JSON.parse(cached) as AuthIdentity;
  } catch {
    /* cache miss or KV unavailable — verify with Google */
  }

  if (!identity) {
    const res = await fetchImpl(TOKENINFO_URL, {
      method: "POST", // token in the body, not the URL, so it never lands in access logs
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }).toString(),
    });
    if (!res.ok) throw new AuthError("Your session has expired. Please sign in again.");

    const info = (await res.json()) as TokenInfo;
    const issuedTo = info.aud || info.azp;
    if (!info.sub || !issuedTo || issuedTo !== env.GOOGLE_CLIENT_ID) {
      log("warn", "Rejected token issued to another client", { issuedTo });
      throw new AuthError("This sign-in is not valid for AaryaAI Finance.");
    }

    identity = { userId: info.sub, email: info.email };
    const expiresIn = Number(info.expires_in) || 0;
    const ttl = Math.min(expiresIn - 30, 3600);
    if (ttl >= KV_MIN_TTL && env.SESSIONS) {
      try {
        await env.SESSIONS.put(cacheKey, JSON.stringify(identity), { expirationTtl: ttl });
      } catch {
        /* caching is best-effort */
      }
    }
  }

  // Defence in depth: an explicitly supplied id must match the verified one
  const claimed = request.headers.get("X-User-Id");
  if (claimed && claimed !== identity.userId) {
    log("warn", "X-User-Id does not match verified identity");
    throw new AuthError("Account mismatch.", 403);
  }

  return identity;
}
