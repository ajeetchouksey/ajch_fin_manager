import { editDistance, merchantText, payeeKey } from './categorize'
import type { Transaction } from './types'

/**
 * Groups spellings of one payee: "Universal-Investment-Gesellschaft" and "Universal Investment GmbH",
 * "Netflix International B.V." inside a PayPal text and "NETFLIX.COM". Shared by the app and the connector.
 */

// First words too common to mean "same payee" on their own ("Deutsche Bahn" vs "Deutsche Telekom")
const GENERIC_FIRST = new Set(['deutsche', 'google', 'amazon', 'paypal', 'apple', 'sparkasse', 'commerzbank', 'international', 'stadtwerke', 'allgemeine', 'european', 'online'])

/** True when two payee keys most likely name the same payee. */
export function samePayee(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 8 && b.length >= 8) {
    if (editDistance(a, b, 2) <= 2) return true
    if (a.startsWith(b) || b.startsWith(a)) return true
  }
  const fa = a.split(' ')[0]
  const fb = b.split(' ')[0]
  return fa === fb && fa.length >= 6 && !GENERIC_FIRST.has(fa)
}

export interface PayeeGroup {
  /** The most used payee key in the group */
  key: string
  /** A readable name: the most common merchant text */
  label: string
  /** Every spelling (payee key) seen */
  keys: string[]
  tx: Transaction[]
}

const mostCommon = (xs: string[]) => {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ''
}

/** Groups transactions by payee, joining spelling variants. Rows without a usable payee are left out. */
export function groupPayees(tx: Transaction[]): PayeeGroup[] {
  const byKey = new Map<string, Transaction[]>()
  for (const t of tx) {
    const k = payeeKey(t.description)
    if (!k) continue
    byKey.set(k, [...(byKey.get(k) ?? []), t])
  }
  const keys = [...byKey.keys()].sort()
  const parent = new Map(keys.map((k) => [k, k]))
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (samePayee(keys[i], keys[j])) parent.set(find(keys[j]), find(keys[i]))
    }
  }
  const groups = new Map<string, string[]>()
  for (const k of keys) groups.set(find(k), [...(groups.get(find(k)) ?? []), k])
  return [...groups.values()].map((ks) => {
    const all = ks.flatMap((k) => byKey.get(k)!)
    const key = [...ks].sort((a, b) => byKey.get(b)!.length - byKey.get(a)!.length || a.localeCompare(b))[0]
    const label = mostCommon(all.map((t) => merchantText(t.description).replace(/\s+/g, ' ').slice(0, 40).trim()))
    return { key, label, keys: ks, tx: all.sort((a, b) => a.date.localeCompare(b.date)) }
  })
}
