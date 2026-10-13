import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../context/LedgerContext'
import { useProfile } from './useProfile'
import { review, type Review, type ReviewInput } from '../lib/analysis/engine'
import { todayIso } from '../lib/ledger/types'
import type { UserSchemaDefinition } from '../types'

/** Profile facts the review uses: country and whether anyone depends on the user. */
export function profileFacts(p: UserSchemaDefinition | null): ReviewInput['profile'] {
  if (!p) return undefined
  const members = p.householdMembers ?? []
  return {
    country: p.taxSettings?.country || p.residenceCountries?.[0],
    householdSize: members.length + 1,
    hasDependents: members.some((m) => /child|kid|son|daughter|dependent|parent|spouse|partner|wife|husband/i.test(m.relationship)),
  }
}

/** The full financial review, computed on this device from the Ledger. */
export function useReview(currency?: string): { review: Review; input: ReviewInput } {
  const { transactions, accounts, balances, goals } = useLedger()
  const { load } = useProfile()
  const [profile, setProfile] = useState<UserSchemaDefinition | null>(null)

  useEffect(() => {
    let alive = true
    void load().then((p) => alive && setProfile(p))
    return () => {
      alive = false
    }
  }, [load])

  return useMemo(() => {
    const input: ReviewInput = { transactions, accounts, balances, goals, profile: profileFacts(profile), today: todayIso(), currency }
    return { review: review(input), input }
  }, [transactions, accounts, balances, goals, profile, currency])
}
