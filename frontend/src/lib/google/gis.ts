/**
 * Google Drive access via Google Identity Services (incremental consent, ADR-001 Inc 1).
 *
 * Sign-in only asks for basic identity. When the user chooses to connect Drive we ask for
 * `drive.file` — access to files this app creates or the user picks, never the whole Drive.
 * The token lives in memory and sessionStorage only (about 1 hour); it never reaches our server.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const STORAGE_KEY = 'aarya.driveToken'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string; login_hint?: string }) => void
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    include_granted_scopes?: boolean
    login_hint?: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: { type?: string; message?: string }) => void
  }) => TokenClient
  revoke?: (token: string, done?: () => void) => void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let scriptPromise: Promise<GoogleOAuth2> | null = null

function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error('Google sign-in did not load. Please try again.'))
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("Couldn't reach Google. Check your connection and try again."))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export interface DriveToken {
  accessToken: string
  expiresAt: number
}

export function getStoredDriveToken(): DriveToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as DriveToken
    return t.accessToken && t.expiresAt - 60_000 > Date.now() ? t : null
  } catch {
    return null
  }
}

export function clearDriveToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Ask Google for a drive.file token. Must be called from a user action (click/tap) the first
 * time, because Google shows a consent popup. Later calls usually return without a prompt.
 */
export async function requestDriveToken(loginHint?: string): Promise<DriveToken> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  const oauth2 = await loadGis()
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      include_granted_scopes: true,
      login_hint: loginHint,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error === 'access_denied' ? 'Drive access was not granted.' : resp.error_description || 'Google did not grant Drive access.'))
          return
        }
        const granted = (resp.scope || '').split(' ')
        if (!granted.includes(DRIVE_SCOPE)) {
          reject(new Error('Please tick the Google Drive permission so the app can save your files.'))
          return
        }
        const token: DriveToken = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
        }
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token))
        } catch {
          /* ignore */
        }
        resolve(token)
      },
      error_callback: (err) => {
        reject(new Error(err?.type === 'popup_closed' ? 'The Google window was closed before finishing.' : err?.type === 'popup_failed_to_open' ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' : 'Google Drive access failed. Please try again.'))
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}
