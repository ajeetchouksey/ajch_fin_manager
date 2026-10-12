// OAuth configuration for Google Sign-In
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const REDIRECT_URI = `${window.location.origin}/oauth/callback`
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
]

export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function getCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('code')
}

export function getErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('error')
}

export async function exchangeCodeForToken(code: string): Promise<any> {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'

  const response = await fetch(`${apiUrl}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, redirectUri: REDIRECT_URI }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to exchange code for token')
  }

  return response.json()
}

export async function getUserProfile(accessToken: string): Promise<any> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch user profile')
  }

  return response.json()
}

export function saveAuthData(data: { accessToken: string; user: any }) {
  localStorage.setItem('authData', JSON.stringify(data))
}

export function loadAuthData() {
  const data = localStorage.getItem('authData')
  return data ? JSON.parse(data) : null
}

export function clearAuthData() {
  localStorage.removeItem('authData')
}
