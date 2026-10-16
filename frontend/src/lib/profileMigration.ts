/**
 * One-time move of a profile from our server (D1) into the user's own Ledger. The server copy is deleted only
 * after the Ledger copy has been read back and matches it exactly; otherwise the server copy is kept.
 */
import { sameProfile, type UserSchemaDefinition } from './ledger/profile'

export type MigrationResult = 'none' | 'moved' | 'kept'

export interface MigrationDeps {
  apiUrl: string
  token: string
  /** Saves to the Ledger and returns what the Ledger holds afterwards (read back, not the input) */
  saveToLedger: (profile: UserSchemaDefinition) => Promise<UserSchemaDefinition | null>
  fetchImpl?: typeof fetch
}

export async function moveServerProfileToLedger({ apiUrl, token, saveToLedger, fetchImpl = fetch }: MigrationDeps): Promise<MigrationResult> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const res = await fetchImpl(`${apiUrl}/api/onboarding/current-schema`, { headers })
  if (!res.ok) return 'none'
  const body = (await res.json()) as { schema?: UserSchemaDefinition | null }
  const server = body.schema ?? null
  if (!server) return 'none'

  const inLedger = await saveToLedger(server)
  if (!sameProfile(inLedger, server)) return 'kept'

  const del = await fetchImpl(`${apiUrl}/api/onboarding/reset`, { method: 'POST', headers })
  return del.ok ? 'moved' : 'kept'
}
