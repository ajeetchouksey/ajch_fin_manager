import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getCodeFromUrl, getErrorFromUrl, exchangeCodeForToken } from '../utils/oauth'
import { FullScreenStatus } from '../components/FullScreenStatus'

export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for OAuth errors
        const oauthError = getErrorFromUrl()
        if (oauthError) {
          throw new Error(`OAuth error: ${oauthError}`)
        }

        // Extract authorization code
        const code = getCodeFromUrl()
        if (!code) {
          throw new Error('No authorization code received')
        }

        // Exchange code for access token
        const tokenData = await exchangeCodeForToken(code)
        const { accessToken } = tokenData

        if (!accessToken) {
          throw new Error('Failed to obtain access token')
        }

        // Log user in
        await login(accessToken)

        // Redirect to dashboard
        navigate('/dashboard')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed'
        setError(message)
        setLoading(false)

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login')
        }, 3000)
      }
    }

    handleCallback()
  }, [login, navigate])

  return loading ? (
    <FullScreenStatus title="Signing you in…" description="Securely connecting your Google account." />
  ) : (
    <FullScreenStatus
      tone="error"
      title="We couldn't sign you in"
      description={
        <>
          {error}
          <br />
          <span className="text-slate-400">Taking you back to the sign-in page…</span>
        </>
      }
    />
  )
}
