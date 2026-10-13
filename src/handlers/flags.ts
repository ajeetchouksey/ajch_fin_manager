/**
 * GET /api/flags — feature flags resolved for the signed-in user (ADR-001 Inc 0).
 * Response: { flags: { "<key>": boolean } }. Unknown or erroring flags resolve to false.
 */

import type { CloudflareEnv } from "../lib/types";
import { buildResponse, log } from "../lib/utils";

interface FlagRow {
  key: string;
  enabled: number;
  allow_users: string | null;
}

export function resolveFlags(rows: FlagRow[], userId: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const row of rows) {
    let allow: unknown = [];
    try {
      allow = JSON.parse(row.allow_users || "[]");
    } catch {
      allow = null; // malformed allow-list: fail closed
    }
    const list = Array.isArray(allow) ? (allow as unknown[]) : null;
    flags[row.key] = row.enabled === 1 && list !== null && (list.length === 0 || list.includes(userId));
  }
  return flags;
}

export async function handleFlags(env: CloudflareEnv, userId: string): Promise<Response> {
  try {
    const result = await env.DB.prepare("SELECT key, enabled, allow_users FROM feature_flags").all();
    return buildResponse({ flags: resolveFlags((result?.results ?? []) as FlagRow[], userId) });
  } catch (error) {
    // Flags must never break the app: report everything as off
    log("error", "Failed to read feature flags", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return buildResponse({ flags: {} });
  }
}
