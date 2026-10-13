import { useState, useCallback, useRef } from 'react'
import type {
  OnboardingMessage,
  UserSchemaDefinition,
  OnboardingStatusResponse,
  OnboardingChatResponse,
  OnboardingCurrentSchemaResponse,
} from '../types'
import { useAuth } from './useAuth'

interface UseOnboardingOptions {
  type?: 'initial' | 'progressive'
  focus?: string
}

/** Turn low-level failures into messages a person can act on. */
function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    // fetch() network/CORS failure — the browser reports "Failed to fetch" / "Load failed" (Safari)
    return "Couldn't reach the AaryaAI service. Check your internet connection and try again."
  }
  if (err instanceof Error && err.message && !err.message.trim().startsWith('{')) return err.message
  return fallback
}

export function useOnboarding(options?: UseOnboardingOptions) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<OnboardingMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentSchema, setCurrentSchema] = useState<UserSchemaDefinition | null>(null)
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatusResponse | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'

  /**
   * Check onboarding status
   */
  const checkStatus = useCallback(async () => {
    if (!user?.accessToken) return

    try {
      setLoading(true)
      const response = await fetch(`${apiUrl}/api/onboarding/status`, {
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) throw new Error('Failed to check onboarding status')
      const data = await response.json() as OnboardingStatusResponse
      setOnboardingStatus(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [user, apiUrl])

  /**
   * Get current schema for review
   */
  const getCurrentSchema = useCallback(async () => {
    if (!user?.accessToken) return

    try {
      setLoading(true)
      const response = await fetch(`${apiUrl}/api/onboarding/current-schema`, {
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch current schema')
      const data = await response.json() as OnboardingCurrentSchemaResponse
      setCurrentSchema(data.schema || null)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [user, apiUrl])

  /**
   * Send chat message and get AI response
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!user?.accessToken) {
        setError('Not authenticated')
        return null
      }

      try {
        setLoading(true)
        setError(null)

        // Add user message to local state
        const userMessage: OnboardingMessage = { role: 'user', content }
        setMessages((prev) => [...prev, userMessage])

        // Call API
        const requestBody = {
          messages: [...messages, userMessage],
          type: options?.type || 'progressive',
          focus: options?.focus,
          context: { currentSchema },
        }

        const response = await fetch(`${apiUrl}/api/onboarding/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.accessToken}`,
            'X-User-Id': user.id,
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          throw new Error(
            response.status >= 500
              ? 'The AaryaAI assistant hit a problem. Please try again in a moment.'
              : 'Your message could not be sent. Please try again.',
          )
        }

        const data = await response.json() as OnboardingChatResponse & { fallbackToForm?: boolean }
        if (data.fallbackToForm) {
          throw new Error("The AaryaAI assistant isn't available right now. Please try again later.")
        }

        // Add assistant message
        const assistantMessage: OnboardingMessage = {
          role: 'assistant',
          content: data.message,
        }
        setMessages((prev) => [...prev, assistantMessage])

        // Update schema if provided
        if (data.schemaUpdate) {
          setCurrentSchema((prev) => ({
            ...prev!,
            ...data.schemaUpdate,
          }))
        }

        return data
      } catch (err) {
        // Roll back the optimistic user message so a retry doesn't duplicate it
        setMessages((prev) => (prev[prev.length - 1]?.content === content ? prev.slice(0, -1) : prev))
        setError(friendlyError(err, 'Your message could not be sent. Please try again.'))
        return null
      } finally {
        setLoading(false)
      }
    },
    [user, messages, currentSchema, options, apiUrl]
  )

  /**
   * Submit final schema
   */
  const submitSchema = useCallback(
    async (schema: Partial<UserSchemaDefinition>, merge: boolean = true) => {
      if (!user?.accessToken) {
        setError('Not authenticated')
        return null
      }

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`${apiUrl}/api/onboarding/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.accessToken}`,
            'X-User-Id': user.id,
          },
          body: JSON.stringify({ schema, merge }),
        })

        if (!response.ok) {
          throw new Error('Your profile could not be saved. Please try again.')
        }

        const data = await response.json()
        setCurrentSchema(data.schema)
        return data
      } catch (err) {
        setError(friendlyError(err, 'Your profile could not be saved. Please try again.'))
        return null
      } finally {
        setLoading(false)
      }
    },
    [user, apiUrl]
  )

  /**
   * Reset onboarding (delete schema)
   */
  const resetOnboarding = useCallback(async () => {
    if (!user?.accessToken) {
      setError('Not authenticated')
      return null
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${apiUrl}/api/onboarding/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) throw new Error('Failed to reset onboarding')

      setMessages([])
      setCurrentSchema(null)
      setOnboardingStatus(null)
      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [user, apiUrl])

  /**
   * Cancel current request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  return {
    messages,
    setMessages,
    loading,
    error,
    setError,
    currentSchema,
    onboardingStatus,
    checkStatus,
    getCurrentSchema,
    sendMessage,
    submitSchema,
    resetOnboarding,
    cancel,
  }
}
