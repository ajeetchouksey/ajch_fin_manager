/**
 * Sync Handler
 * Synchronizes financial data between browser cache and Google Drive
 */

import type { CloudflareEnv, SyncRequest, SyncResponse } from "../lib/types";
import { buildResponse, buildErrorResponse, parseJSON, log } from "../lib/utils";
import { AppErrorClass } from "../lib/utils";
import GoogleDriveManager from "../lib/gdrive";

/**
 * Handle sync requests
 */
export async function handleSync(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  try {
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return buildResponse({}, 200);
    }

    if (method !== "GET" && method !== "POST") {
      throw new AppErrorClass("METHOD_NOT_ALLOWED", "GET or POST required", 405);
    }

    const url = new URL(request.url);
    const accessToken = request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!accessToken) {
      throw new AppErrorClass(
        "MISSING_AUTH",
        "Authorization header with Bearer token required",
        401
      );
    }

    // Parse request body for POST
    let syncRequest: SyncRequest | undefined;
    if (method === "POST") {
      const body = await request.text();
      syncRequest = parseJSON<SyncRequest>(body);
    } else {
      // GET request with query params
      const userId = url.searchParams.get("userId");
      const scope = url.searchParams.get("scope") || "all";

      if (!userId) {
        throw new AppErrorClass(
          "MISSING_USERID",
          "userId query parameter required",
          400
        );
      }

      syncRequest = {
        userId,
        scope: (scope as "all" | "accounts" | "transactions" | "goals") || "all",
      };
    }

    if (!syncRequest || !syncRequest.userId) {
      throw new AppErrorClass("INVALID_REQUEST", "Invalid sync request", 400);
    }

    log("info", "Sync request", {
      userId: syncRequest.userId,
      scope: syncRequest.scope,
    });

    // Initialize Google Drive manager
    const driveManager = new GoogleDriveManager(env);

    // Get Finance folder
    await driveManager.getOrCreateFinanceFolder(accessToken);

    // Sync based on scope
    const syncedAt = new Date().toISOString();
    let changes = {
      accounts: 0,
      transactions: 0,
      goals: 0,
    };

    if (
      syncRequest.scope === "all" ||
      syncRequest.scope === "accounts"
    ) {
      // TODO: Sync accounts
      changes.accounts = 0;
    }

    if (
      syncRequest.scope === "all" ||
      syncRequest.scope === "transactions"
    ) {
      // TODO: Sync transactions
      changes.transactions = 0;
    }

    if (syncRequest.scope === "all" || syncRequest.scope === "goals") {
      // TODO: Sync goals
      changes.goals = 0;
    }

    // Calculate next sync time (30 seconds from now)
    const nextSync = new Date();
    nextSync.setSeconds(nextSync.getSeconds() + 30);

    const response: SyncResponse = {
      success: true,
      syncedAt,
      changes,
      nextSyncAt: nextSync.toISOString(),
    };

    log("info", "Sync completed", { changes });

    return buildResponse(response, 200);
  } catch (error) {
    log("error", "Sync handler error", { error });
    return buildErrorResponse(error);
  }
}

/**
 * Perform background sync
 * Called periodically or when changes are detected
 */
export async function performBackgroundSync(
  userId: string,
  env: CloudflareEnv,
  accessToken: string
): Promise<void> {
  try {
    const driveManager = new GoogleDriveManager(env);

    // Get Finance folder
    const financeFolder = await driveManager.getOrCreateFinanceFolder(accessToken);

    // Sync data
    const data = await driveManager.syncFinancialData(accessToken, financeFolder);

    log("info", "Background sync completed", {
      userId,
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      goals: data.goals.length,
    });

    // TODO: Store sync result in KV namespace for later retrieval
  } catch (error) {
    log("error", "Background sync error", { userId, error });
  }
}
