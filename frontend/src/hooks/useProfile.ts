import { useCallback, useState } from 'react'
import type { OnboardingCurrentSchemaResponse, UserSchemaDefinition } from '../types'
import { useAuth } from './useAuth'
import { isSessionExpired } from '../utils/session'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'

export type ProfileUpdate = Partial<UserSchemaDefinition>

/** Load and save the financial profile (no AI involved). */
export function useProfile() {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headers = useCallback(
    (): Record<string, string> => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user?.accessToken ?? ''}`,
    }),
    [user],
  )

  const load = useCallback(async (): Promise<UserSchemaDefinition | null> => {
    if (!user) return null
    try {
      const res = await fetch(`${apiUrl}/api/onboarding/current-schema`, { headers: headers() })
      if (isSessionExpired(res) || !res.ok) return null
      const data = (await res.json()) as OnboardingCurrentSchemaResponse
      return data.schema ?? null
    } catch {
      return null
    }
  }, [user, headers])

  /**
   * Save fields. The fields sent replace what is stored (so un-ticking an item sticks);
   * fields not sent are kept. With `complete: true` the whole profile is validated (first setup).
   */
  const save = useCallback(
    async (fields: ProfileUpdate, opts: { complete?: boolean } = {}): Promise<UserSchemaDefinition | null> => {
      if (!user) return null
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`${apiUrl}/api/onboarding/submit`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ schema: fields, merge: !opts.complete, mode: 'replace' }),
        })
        if (isSessionExpired(res)) return null
        if (!res.ok) {
          throw new Error(
            res.status === 400
              ? 'Some answers could not be saved. Please check them and try again.'
              : 'Your answers could not be saved. Please try again.',
          )
        }
        const data = (await res.json()) as { schema?: UserSchemaDefinition }
        return data.schema ?? null
      } catch (err) {
        setError(
          err instanceof TypeError
            ? "Couldn't reach the server. Check your internet connection and try again."
            : err instanceof Error
              ? err.message
              : 'Your answers could not be saved. Please try again.',
        )
        return null
      } finally {
        setSaving(false)
      }
    },
    [user, headers],
  )

  return { load, save, saving, error, setError }
}
