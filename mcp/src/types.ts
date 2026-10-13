import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export const SCOPE_READ = 'ledger:read'
export const SCOPE_WRITE = 'ledger:write'

export interface Env {
  OAUTH_KV: KVNamespace
  OAUTH_PROVIDER: OAuthHelpers
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  /** Public origin of this connector, e.g. https://mcp.finbuddy.aaryaai.dev */
  PUBLIC_URL: string
}

/**
 * Stored with the grant (encrypted by the OAuth library with a key only the token holder can unwrap).
 * The Google refresh token never reaches tool code.
 */
export interface GrantProps {
  userId: string
  email: string
  scope: string[]
  googleRefreshToken: string
  /** Only present right after sign-in, until the first token exchange moves it to the access token */
  googleAccessToken?: string
  googleExpiresIn?: number
}

/** What each MCP request sees: the user and a short-lived Google access token. */
export interface AccessProps {
  [key: string]: unknown
  userId: string
  email: string
  scope: string[]
  googleAccessToken: string
}
