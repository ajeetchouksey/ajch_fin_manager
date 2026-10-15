/**
 * Account rules from the F01 spec: every transaction belongs to a real account by id, an account is
 * recognised by a fingerprint of its IBAN (never by name), and setup suggests what it can and asks the
 * user to confirm. Nothing here writes to the Ledger: migrations are planned first and applied later.
 */
import type { Transaction } from './types'

/** A known bank by its national bank code (German BLZ, the digits after the country and check digits). */
export const KNOWN_BANKS: Record<string, string> = {
  '50040000': 'Commerzbank',
}

export const INSTITUTIONS = Array.from(new Set(Object.values(KNOWN_BANKS)))

export interface IbanInfo {
  /** Last four characters, the only part of the IBAN that is stored */
  last4: string
  /** Bank code, when the IBAN is German (DE) */
  bankCode?: string
  /** Institution from the bundled list, when known */
  institution?: string
}

const iban97 = (iban: string): number => {
  // Move the first four characters to the end and turn letters into numbers (A=10 … Z=35)
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`
  let rem = 0
  for (const ch of moved) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of v) rem = (rem * 10 + Number(d)) % 97
  }
  return rem
}

/** Checks the shape and check digits of an IBAN. Spaces are ignored. */
export function normaliseIban(raw: string): string | null {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null
  return iban97(iban) === 1 ? iban : null
}

/** What is safe to keep about an IBAN: its last four characters, its bank, and nothing else. */
export function describeIban(iban: string): IbanInfo {
  const info: IbanInfo = { last4: iban.slice(-4) }
  if (iban.startsWith('DE') && iban.length === 22) {
    info.bankCode = iban.slice(4, 12)
    info.institution = KNOWN_BANKS[info.bankCode]
  }
  return info
}

/** A salted SHA-256 of the full IBAN, used to recognise the same account in a later file. */
export async function ibanFingerprint(iban: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${iban}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Edit distance between two names, for spelling checks ("CoomerzBank" is one letter from "Commerzbank"). */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[y.length]
}

/** The known institution a typed name is probably meant to be, when it is one or two letters away. */
export function suggestInstitution(typed: string, known: string[] = INSTITUTIONS): string | null {
  const name = typed.trim()
  if (!name) return null
  if (known.some((k) => k.toLowerCase() === name.toLowerCase())) return null
  let best: { name: string; dist: number } | null = null
  for (const k of known) {
    const dist = editDistance(name, k)
    if (dist <= 2 && (!best || dist < best.dist)) best = { name: k, dist }
  }
  return best?.name ?? null
}

/**
 * Suggests the account type from what the account's rows look like. Salary or direct debits point to a
 * current account; interest-only money in points to savings. Null when there is no clear signal.
 */
export function suggestAccountType(transactions: Transaction[]): 'current' | 'savings' | null {
  const money = transactions.filter((t) => t.direction === 'in')
  const salaryOrDebits = transactions.some((t) => t.category === 'Salary' || t.category === 'Rent' || t.category === 'Loan & EMI')
  if (salaryOrDebits) return 'current'
  if (money.length && money.every((t) => t.category === 'Interest')) return 'savings'
  return null
}

export interface LabelMigrationPlan {
  /** Rows that carry the label and will be linked to the account id */
  toLink: number
  /** Rows already linked to some account id (not touched) */
  alreadyLinked: number
  /** Rows with another label (left for the user to decide) */
  otherLabels: Record<string, number>
  /** Rows with no account label at all */
  unlabelled: number
}

/**
 * Preview of re-linking rows from an account label (such as "Savings") to an account id. It only counts;
 * it writes nothing. The spec requires the preview to be shown before anything is applied.
 */
export function planLabelMigration(rows: Array<{ account: string; accountId?: string }>, label: string): LabelMigrationPlan {
  const plan: LabelMigrationPlan = { toLink: 0, alreadyLinked: 0, otherLabels: {}, unlabelled: 0 }
  for (const r of rows) {
    if (r.accountId) plan.alreadyLinked++
    else if (!r.account) plan.unlabelled++
    else if (r.account === label) plan.toLink++
    else plan.otherLabels[r.account] = (plan.otherLabels[r.account] ?? 0) + 1
  }
  return plan
}
