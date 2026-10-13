/**
 * Google sign-in for the connector. Uses the same Google Cloud OAuth client as the FinBuddy web app,
 * so the `drive.file` permission covers the Ledger the web app created (and nothing else in Drive).
 */

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file']

export interface GoogleEnv {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

export interface GoogleTokens {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  scope: string
}

export class GoogleAuthError extends Error {
  /** Google said the grant is gone for good (revoked or expired); the user must reconnect */
  revoked: boolean
  constructor(message: string, revoked: boolean) {
    super(message)
    this.name = 'GoogleAuthError'
    this.revoked = revoked
  }
}

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function googleAuthorizeUrl(env: GoogleEnv, o: { redirectUri: string; state: string; codeChallenge: string; loginHint?: string }): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state: o.state,
    code_challenge: o.codeChallenge,
    code_challenge_method: 'S256',
    // A refresh token is needed so the AI app stays connected; Google only sends one with consent
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  if (o.loginHint) p.set('login_hint', o.loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenRequest(env: GoogleEnv, body: Record<string, string>): Promise<GoogleTokens> {
  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...body }),
    })
  } catch {
    throw new GoogleAuthError('Google could not be reached.', false)
  }
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    error?: string
  }
  if (!res.ok || !data.access_token) {
    throw new GoogleAuthError(`Google token request failed: ${data.error ?? res.status}`, data.error === 'invalid_grant')
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? 3600, scope: data.scope ?? '' }
}

export const exchangeGoogleCode = (env: GoogleEnv, code: string, verifier: string, redirectUri: string) =>
  tokenRequest(env, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri })

export const refreshGoogleToken = (env: GoogleEnv, refreshToken: string) => tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refreshToken })

/** The signed-in Google account (stable id and email). */
export async function googleUser(accessToken: string): Promise<{ id: string; email: string }> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new GoogleAuthError('Could not read the Google account.', false)
  const u = (await res.json()) as { sub?: string; email?: string }
  if (!u.sub) throw new GoogleAuthError('Google did not return an account id.', false)
  return { id: u.sub, email: u.email ?? '' }
}
