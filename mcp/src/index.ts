/**
 * FinBuddy connector: a remote MCP server that lets the user's own AI app (Claude, ChatGPT or any
 * MCP client, on desktop or phone) read and update their FinBuddy Ledger in Google Drive.
 *
 * - This Worker is the OAuth authorization server for MCP clients; users sign in with Google.
 * - Each MCP request carries a short-lived Google access token; the Google refresh token stays in
 *   the encrypted grant and is only used here, to issue the next access token.
 * - Tools reuse the web app's Ledger client, statement reader and review engine (frontend/src/lib).
 */

import { OAuthError, OAuthProvider, type TokenExchangeCallbackOptions } from '@cloudflare/workers-oauth-provider'
import { createMcpHandler } from 'agents/mcp'
import { authHandler } from './auth-handler'
import { GoogleAuthError, refreshGoogleToken } from './google'
import { buildServer } from './tools'
import { SCOPE_READ, SCOPE_WRITE, type AccessProps, type Env, type GrantProps } from './types'

const DAY = 86_400

const mcpHandler = createMcpHandler(buildServer, { route: '/mcp' })

/** Google access tokens last an hour; ours end a little earlier so a request never carries an expired one. */
const ttlFor = (googleExpiresIn = 3600) => Math.max(300, Math.min(3300, googleExpiresIn - 120))

const access = (p: GrantProps, googleAccessToken: string): AccessProps => ({ userId: p.userId, email: p.email, scope: p.scope, googleAccessToken })

async function tokenExchangeCallback(options: TokenExchangeCallbackOptions<Env>) {
  const props = options.props as GrantProps
  if (options.grantType === 'authorization_code') {
    // First token: use the Google access token from sign-in, keep only the refresh token in the grant
    const { googleAccessToken, googleExpiresIn, ...grant } = props
    if (!googleAccessToken) throw new OAuthError('invalid_grant', { description: 'Sign-in incomplete. Connect again.' })
    return { accessTokenProps: access(props, googleAccessToken), newProps: grant, accessTokenTTL: ttlFor(googleExpiresIn) }
  }
  if (options.grantType === 'refresh_token') {
    try {
      const google = await refreshGoogleToken(options.env, props.googleRefreshToken)
      const grant: GrantProps = google.refreshToken ? { ...props, googleRefreshToken: google.refreshToken } : props
      return { accessTokenProps: access(grant, google.accessToken), newProps: grant, accessTokenTTL: ttlFor(google.expiresIn) }
    } catch (error) {
      if (error instanceof GoogleAuthError && error.revoked) {
        // The user removed FinBuddy's access in Google: end this connection so the AI app asks to reconnect
        throw new OAuthError('invalid_grant', { description: 'Google access was removed. Connect FinBuddy again.' })
      }
      throw new OAuthError('temporarily_unavailable', { description: 'Google is not reachable right now.', statusCode: 503 })
    }
  }
}

let provider: OAuthProvider<Env> | null = null
let providerFor = ''

function getProvider(env: Env): OAuthProvider<Env> {
  const origin = env.PUBLIC_URL.replace(/\/+$/, '')
  if (provider && providerFor === origin) return provider
  provider = new OAuthProvider<Env>({
    apiRoute: '/mcp',
    apiHandler: { fetch: (request, env, ctx) => mcpHandler(request, env, ctx) },
    defaultHandler: authHandler,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [SCOPE_READ, SCOPE_WRITE, 'offline_access'],
    // Clients ask for both; the consent page lets the user untick writing
    requiredScopes: [SCOPE_READ, SCOPE_WRITE],
    resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin], resource_name: 'FinBuddy Ledger' },
    // Stay connected while used: each refresh extends the connection; it ends after 90 idle days
    refreshTokenIdleTTL: 90 * DAY,
    refreshTokenTTL: 365 * DAY,
    tokenExchangeCallback,
  })
  providerFor = origin
  return provider
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return getProvider(env).fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
