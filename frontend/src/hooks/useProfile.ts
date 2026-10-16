import { useCallback, useState } from 'react'
import type { UserSchemaDefinition } from '../types'
import { useLedger } from '../context/LedgerContext'

export type ProfileUpdate = Partial<UserSchemaDefinition>

/**
 * Load and save the financial profile. It lives in the Profile tab of the user's own Ledger, so it is
 * only available once Google Drive is connected. Nothing about the profile is stored on our servers.
 */
export function useProfile() {
  const { status, profile, saveProfile } = useLedger()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Changes when the Ledger's profile changes, so screens that load it refresh by themselves
  const load = useCallback(async (): Promise<UserSchemaDefinition | null> => (status === 'ready' ? profile : null), [status, profile])

  /**
   * Save fields. The fields sent replace what is stored (so un-ticking an item sticks); fields not sent
   * are kept. `complete` is accepted for the first setup and saves the same way.
   */
  const save = useCallback(
    async (fields: ProfileUpdate, _opts: { complete?: boolean } = {}): Promise<UserSchemaDefinition | null> => {
      void _opts
      if (status !== 'ready') {
        setError('Connect Google Drive first, so your answers can be saved in your own Ledger.')
        return null
      }
      setSaving(true)
      setError(null)
      try {
        return await saveProfile(fields)
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'Your answers could not be saved. Please try again.')
        return null
      } finally {
        setSaving(false)
      }
    },
    [status, saveProfile],
  )

  return { load, save, saving, error, setError }
}
