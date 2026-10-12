/**
 * Google Drive Integration Module
 * Handles OAuth, file operations, and sync for GDPR-compliant data storage
 */

import type {
  CloudflareEnv,
  GoogleOAuthToken,
  GoogleDriveFile,
  Account,
  Transaction,
  Goal,
} from "./types";
import { AppErrorClass, toBase64, fromBase64, log, retryWithBackoff } from "./utils";

export class GoogleDriveManager {
  private env: CloudflareEnv;
  private clientId: string;
  private clientSecret: string;

  constructor(env: CloudflareEnv) {
    this.env = env;
    this.clientId = env.GOOGLE_CLIENT_ID;
    this.clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!this.clientId || !this.clientSecret) {
      throw new AppErrorClass(
        "GOOGLE_CONFIG_ERROR",
        "Google Client ID and Secret must be configured",
        500
      );
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.file",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<GoogleOAuthToken> {
    return retryWithBackoff(async () => {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "OAUTH_ERROR",
          `Failed to exchange code: ${error.error_description}`,
          response.status,
          error
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: expiresAt.toISOString(),
        scope: "https://www.googleapis.com/auth/drive.file",
      };
    });
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(refreshToken: string): Promise<GoogleOAuthToken> {
    return retryWithBackoff(async () => {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "TOKEN_REFRESH_ERROR",
          "Failed to refresh token",
          response.status,
          error
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

      return {
        accessToken: data.access_token,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
        scope: "https://www.googleapis.com/auth/drive.file",
      };
    });
  }

  /**
   * Create or get the Finance folder in Google Drive
   */
  async getOrCreateFinanceFolder(accessToken: string): Promise<string> {
    // Search for existing Finance folder
    const folders = await this.searchFiles(
      accessToken,
      "name = 'Finance' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      1
    );

    if (folders.length > 0) {
      return folders[0].id;
    }

    // Create new Finance folder
    return this.createFolder(accessToken, "Finance");
  }

  /**
   * Create a folder in Google Drive
   */
  async createFolder(accessToken: string, folderName: string): Promise<string> {
    return retryWithBackoff(async () => {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "DRIVE_CREATE_ERROR",
          "Failed to create folder",
          response.status,
          error
        );
      }

      const data = (await response.json()) as { id: string };
      return data.id;
    });
  }

  /**
   * Search files in Google Drive
   */
  async searchFiles(
    accessToken: string,
    query: string,
    pageSize: number = 10
  ): Promise<GoogleDriveFile[]> {
    return retryWithBackoff(async () => {
      const params = new URLSearchParams({
        q: query,
        pageSize: pageSize.toString(),
        spaces: "drive",
        fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
      });

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "DRIVE_SEARCH_ERROR",
          "Failed to search files",
          response.status,
          error
        );
      }

      const data = (await response.json()) as { files: GoogleDriveFile[] };
      return data.files || [];
    });
  }

  /**
   * Read file content from Google Drive
   */
  async readFile(accessToken: string, fileId: string): Promise<string> {
    return retryWithBackoff(async () => {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "DRIVE_READ_ERROR",
          "Failed to read file",
          response.status,
          error
        );
      }

      return response.text();
    });
  }

  /**
   * Write/Update file content in Google Drive
   */
  async writeFile(
    accessToken: string,
    fileId: string,
    content: string,
    mimeType: string = "application/json"
  ): Promise<void> {
    return retryWithBackoff(async () => {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": mimeType,
          },
          body: content,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "DRIVE_WRITE_ERROR",
          "Failed to write file",
          response.status,
          error
        );
      }
    });
  }

  /**
   * Create a new file in Google Drive
   */
  async createFile(
    accessToken: string,
    fileName: string,
    content: string,
    parentFolderId?: string,
    mimeType: string = "application/json"
  ): Promise<string> {
    return retryWithBackoff(async () => {
      const metadata = {
        name: fileName,
        mimeType,
        ...(parentFolderId && { parents: [parentFolderId] }),
      };

      const boundary = "===============7330845974216740156==";
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary="${boundary}"`,
          },
          body,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new AppErrorClass(
          "DRIVE_CREATE_FILE_ERROR",
          "Failed to create file",
          response.status,
          error
        );
      }

      const data = (await response.json()) as { id: string };
      return data.id;
    });
  }

  /**
   * Sync financial data from Google Drive
   */
  async syncFinancialData(
    accessToken: string,
    financeFolder: string
  ): Promise<{
    accounts: Account[];
    transactions: Transaction[];
    goals: Goal[];
  }> {
    try {
      // Get or create data files
      const files = await this.searchFiles(
        accessToken,
        `'${financeFolder}' in parents and trashed = false`
      );

      let accountsFileId = files.find(
        (f) => f.name === "accounts.json"
      )?.id;
      let transactionsFileId = files.find(
        (f) => f.name === "transactions.json"
      )?.id;
      let goalsFileId = files.find((f) => f.name === "goals.json")?.id;

      // Read existing data or initialize empty
      let accounts: Account[] = [];
      let transactions: Transaction[] = [];
      let goals: Goal[] = [];

      if (accountsFileId) {
        const content = await this.readFile(accessToken, accountsFileId);
        try {
          accounts = JSON.parse(content);
        } catch {
          log("warn", "Failed to parse accounts.json, using empty array");
        }
      }

      if (transactionsFileId) {
        const content = await this.readFile(accessToken, transactionsFileId);
        try {
          transactions = JSON.parse(content);
        } catch {
          log("warn", "Failed to parse transactions.json, using empty array");
        }
      }

      if (goalsFileId) {
        const content = await this.readFile(accessToken, goalsFileId);
        try {
          goals = JSON.parse(content);
        } catch {
          log("warn", "Failed to parse goals.json, using empty array");
        }
      }

      return { accounts, transactions, goals };
    } catch (error) {
      log("error", "Error syncing financial data from Drive", error);
      throw error;
    }
  }

  /**
   * Save financial data to Google Drive
   */
  async saveFinancialData(
    accessToken: string,
    financeFolder: string,
    data: {
      accounts: Account[];
      transactions: Transaction[];
      goals: Goal[];
    }
  ): Promise<void> {
    try {
      const files = await this.searchFiles(
        accessToken,
        `'${financeFolder}' in parents and trashed = false`
      );

      let accountsFileId = files.find((f) => f.name === "accounts.json")?.id;
      let transactionsFileId = files.find(
        (f) => f.name === "transactions.json"
      )?.id;
      let goalsFileId = files.find((f) => f.name === "goals.json")?.id;

      // Save accounts
      if (accountsFileId) {
        await this.writeFile(
          accessToken,
          accountsFileId,
          JSON.stringify(data.accounts, null, 2)
        );
      } else {
        await this.createFile(
          accessToken,
          "accounts.json",
          JSON.stringify(data.accounts, null, 2),
          financeFolder
        );
      }

      // Save transactions
      if (transactionsFileId) {
        await this.writeFile(
          accessToken,
          transactionsFileId,
          JSON.stringify(data.transactions, null, 2)
        );
      } else {
        await this.createFile(
          accessToken,
          "transactions.json",
          JSON.stringify(data.transactions, null, 2),
          financeFolder
        );
      }

      // Save goals
      if (goalsFileId) {
        await this.writeFile(
          accessToken,
          goalsFileId,
          JSON.stringify(data.goals, null, 2)
        );
      } else {
        await this.createFile(
          accessToken,
          "goals.json",
          JSON.stringify(data.goals, null, 2),
          financeFolder
        );
      }

      log("info", "Successfully saved financial data to Google Drive");
    } catch (error) {
      log("error", "Error saving financial data to Drive", error);
      throw error;
    }
  }
}

export default GoogleDriveManager;
