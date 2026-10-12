import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getCodeFromUrl, getErrorFromUrl, exchangeCodeForToken } from '../utils/oauth'
import './OAuthCallbackPage.css'

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

  return (
    <div className="callback-container">
      <div className="callback-card">
        {loading ? (
          <>
            <div className="spinner"></div>
            <h1>Signing you in...</h1>
            <p>Please wait while we authenticate your account</p>
          </>
        ) : (
          <>
            <h1>Authentication Error</h1>
            <p className="error-message">{error}</p>
            <p className="redirect-message">Redirecting you to login...</p>
          </>
        )}
      </div>
    </div>
  )
}
