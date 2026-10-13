import { useEffect, useMemo, useState } from 'react'
import { useProfile } from './useProfile'
import { useLedger } from '../context/LedgerContext'
import { ACCOUNT_TYPES, DEFAULT_CATEGORIES } from '../components/setup/options'
import { INCOME_CATEGORIES, currencyForCountry } from '../lib/ledger/types'
import type { UserSchemaDefinition } from '../types'

const LAST_KEY = 'aarya.lastEntry'

export interface LastEntry {
  currency?: string
  account?: string
}

export function readLastEntry(): LastEntry {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') as LastEntry
  } catch {
    return {}
  }
}

export function writeLastEntry(e: LastEntry) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(e))
  } catch {
    /* ignore */
  }
}

/** Choices for transaction forms, from the user's profile plus what is already in the Ledger. */
export function useLedgerOptions() {
  const { load } = useProfile()
  const { transactions } = useLedger()
  const [profile, setProfile] = useState<UserSchemaDefinition | null>(null)

  useEffect(() => {
    let alive = true
    void load().then((p) => alive && setProfile(p))
    return () => {
      alive = false
    }
  }, [load])

  return useMemo(() => {
    const used = (pick: (t: (typeof transactions)[number]) => string) =>
      Array.from(new Set(transactions.map(pick).filter(Boolean)))
    const accountLabels = (profile?.accountTypes?.length ? profile.accountTypes : ACCOUNT_TYPES.map((a) => a.value)).map(
      (v) => ACCOUNT_TYPES.find((a) => a.value === v)?.label ?? v,
    )
    const accounts = Array.from(new Set([...used((t) => t.account), ...accountLabels]))
    const expense = Array.from(new Set([...(profile?.expenseCategories?.length ? profile.expenseCategories : DEFAULT_CATEGORIES), ...transactions.filter((t) => t.direction === 'out').map((t) => t.category).filter(Boolean)]))
    const income = Array.from(new Set([...INCOME_CATEGORIES, ...transactions.filter((t) => t.direction === 'in').map((t) => t.category).filter(Boolean)]))
    const tags = Array.from(new Set(transactions.flatMap((t) => t.tags))).slice(0, 30)
    const defaultCurrency = readLastEntry().currency || currencyForCountry(profile?.taxSettings?.country || profile?.residenceCountries?.[0])
    return { accounts, expenseCategories: Array.from(new Set([...expense, 'Other'])), incomeCategories: income, tags, defaultCurrency }
  }, [profile, transactions])
}
