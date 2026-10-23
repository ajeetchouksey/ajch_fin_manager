/**
 * What was put in versus what it is worth now, and how investments are spread across kinds of holding
 * compared with a target the person sets. Both work from accounts alone (their type, balance history and
 * the payments recorded on them); finer detail arrives with holdings. Nothing here says what to buy or sell.
 */

import { belongsTo, currentBalance } from './balances'
import { accountType, type Account, type BalanceEntry } from './portfolio'
import type { Transaction } from './types'

const round = (n: number) => Math.round(n * 100) / 100

// ---------- put in versus worth ----------

export interface PutInRow {
  id: string
  name: string
  currency: string
  /** Value today */
  worth: number
  /** The first balance on record plus payments in, less payments out, recorded since */
  putIn: number
  /** Worth less put in: what the account has gained or lost beyond what was paid in */
  change: number
  /** Change as a share of what was put in; null when nothing was put in */
  changeShare: number | null
  /** Date of the first balance on record */
  since: string
  /** False until the account has at least two recorded balances; before that the change cannot be told from the payments */
  enough: boolean
}

/** One row for each investment or retirement account. */
export function putInVersusWorth(accounts: Account[], history: BalanceEntry[], transactions: Transaction[], today: string): PutInRow[] {
  const out: PutInRow[] = []
  for (const a of accounts) {
    if (!['investments', 'retirement'].includes(accountType(a.type).group)) continue
    const entries = history.filter((h) => h.accountId === a.id && h.date <= today).sort((x, y) => x.date.localeCompare(y.date))
    const first = entries[0] ?? { date: a.asOf, balance: a.balance }
    const worth = currentBalance(a, history, transactions, today).balance
    let paid = 0
    for (const t of transactions) {
      if (t.date <= first.date || t.date > today || !belongsTo(t, a)) continue
      paid += t.direction === 'in' ? t.amount : -t.amount
    }
    const putIn = round(first.balance + paid)
    out.push({
      id: a.id,
      name: a.name,
      currency: a.currency,
      worth,
      putIn,
      change: round(worth - putIn),
      changeShare: putIn > 0 ? Math.round(((worth - putIn) / putIn) * 10000) / 10000 : null,
      since: first.date,
      enough: entries.length >= 2,
    })
  }
  return out
}

// ---------- allocation ----------

export const ASSET_CLASSES = [
  { id: 'funds', label: 'Funds & ETFs' },
  { id: 'shares', label: 'Shares' },
  { id: 'gold', label: 'Gold & metals' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'retirement', label: 'Retirement accounts' },
] as const

export type AssetClassId = (typeof ASSET_CLASSES)[number]['id']
/** Target share of each kind, in whole percent */
export type AllocationTarget = Partial<Record<AssetClassId, number>>

/** Beyond this many percentage points from the target, a kind is flagged. */
export const DRIFT_LIMIT = 5

const CLASS_OF_TYPE: Record<string, AssetClassId> = { brokerage: 'funds', mutual_fund: 'funds', shares: 'shares', gold: 'gold', crypto: 'crypto' }

/** The kind of holding an account counts as, from its type; null for accounts that are not investments. */
export function assetClassOf(type: string): AssetClassId | null {
  const group = accountType(type).group
  if (group === 'retirement') return 'retirement'
  return group === 'investments' ? (CLASS_OF_TYPE[type] ?? 'funds') : null
}

/** Keeps only known kinds with a whole percentage from 0 to 100. */
export function cleanTarget(raw: unknown): AllocationTarget | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: AllocationTarget = {}
  for (const c of ASSET_CLASSES) {
    const v = (raw as Record<string, unknown>)[c.id]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) out[c.id] = Math.round(v)
  }
  return Object.keys(out).length ? out : undefined
}

/** Why a target cannot be saved yet, or null: the shares must add up to 100. */
export function targetProblem(t: AllocationTarget): string | null {
  const sum = Object.values(t).reduce((s, v) => s + (v ?? 0), 0)
  return sum === 100 ? null : `The shares add up to ${sum}%; they need to add up to 100%.`
}

export interface AllocationLine {
  id: AssetClassId
  label: string
  value: number
  /** Share of the total, 0 to 1 */
  share: number
  /** Target in percent, when one is set for this kind */
  target?: number
  /** Share minus target in percentage points (positive = above target) */
  drift?: number
  flagged: boolean
}

export interface Allocation {
  currency: string
  total: number
  lines: AllocationLine[]
}

/** How the investment and retirement accounts in one currency are spread, with drift from the target when one is set. */
export function allocationFor(accounts: Account[], history: BalanceEntry[], transactions: Transaction[], currency: string, today: string, target?: AllocationTarget): Allocation {
  const values = new Map<AssetClassId, number>()
  for (const a of accounts) {
    if (a.currency.toUpperCase() !== currency.toUpperCase()) continue
    const cls = assetClassOf(a.type)
    if (!cls) continue
    values.set(cls, (values.get(cls) ?? 0) + currentBalance(a, history, transactions, today).balance)
  }
  const total = round([...values.values()].reduce((s, v) => s + v, 0))
  const lines: AllocationLine[] = []
  for (const c of ASSET_CLASSES) {
    const value = round(values.get(c.id) ?? 0)
    const t = target?.[c.id]
    if (value === 0 && !t) continue
    const share = total > 0 ? value / total : 0
    const drift = t !== undefined ? Math.round((share * 100 - t) * 10) / 10 : undefined
    lines.push({ id: c.id, label: c.label, value, share, target: t, drift, flagged: drift !== undefined && Math.abs(drift) > DRIFT_LIMIT })
  }
  return { currency, total, lines }
}

/** One sentence per flagged kind, in plain words; no instruction to buy or sell. */
export function driftNotes(a: Allocation): string[] {
  return a.lines
    .filter((l) => l.flagged && l.drift !== undefined)
    .map((l) => `${l.label} is ${Math.abs(Math.round(l.drift!))} points ${l.drift! > 0 ? 'above' : 'below'} your target of ${l.target}%.`)
}
