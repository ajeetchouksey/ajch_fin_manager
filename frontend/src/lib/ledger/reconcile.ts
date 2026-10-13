/**
 * Matches imported statement rows to transactions already in the Ledger, so entries the user
 * typed in themselves are not imported a second time. The user's own entry is kept as is.
 *
 * A row matches an existing transaction with the same direction and amount (to the cent), the
 * same currency, and a date at most `maxDays` apart (cards are often booked a few days after the
 * purchase). Descriptions only break ties, since a typed "REWE weekly shop" rarely reads like
 * the bank's "Lastschrift REWE Markt GmbH". Each existing transaction matches at most one row.
 */
import { dedupeKey, type Transaction } from './types'

export type MatchKind = 'exact' | 'likely'

export interface LedgerMatch {
  tx: Transaction
  kind: MatchKind
  /** Days between the statement row and the existing entry */
  days: number
}

export type RowToMatch = Pick<Transaction, 'date' | 'direction' | 'amount' | 'currency' | 'description'>

export const DEFAULT_MATCH_DAYS = 4

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-zäöüß ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  )

/** 0..1: share of the shorter description's words found in the other. */
export function similarity(a: string, b: string): number {
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return 0
  let common = 0
  for (const w of wa) if (wb.has(w)) common++
  return common / Math.min(wa.size, wb.size)
}

/**
 * Returns, for each row, the Ledger transaction it matches (or undefined).
 * `null` rows (unreadable) are skipped but keep their position.
 */
export function matchToLedger(rows: Array<RowToMatch | null>, ledger: Transaction[], maxDays = DEFAULT_MATCH_DAYS): Array<LedgerMatch | undefined> {
  const result: Array<LedgerMatch | undefined> = rows.map(() => undefined)
  const used = new Set<string>()

  const byAmount = new Map<string, Transaction[]>()
  for (const t of ledger) {
    const k = `${t.direction}|${t.amount.toFixed(2)}`
    const list = byAmount.get(k)
    if (list) list.push(t)
    else byAmount.set(k, [t])
  }

  // Pass 1: exact duplicates (same date, amount, direction and description)
  const exact = new Map<string, Transaction[]>()
  for (const t of ledger) {
    const k = dedupeKey(t)
    const list = exact.get(k)
    if (list) list.push(t)
    else exact.set(k, [t])
  }
  rows.forEach((r, i) => {
    if (!r) return
    const hit = exact.get(dedupeKey(r))?.find((t) => !used.has(t.id) && sameCurrency(r, t))
    if (hit) {
      used.add(hit.id)
      result[i] = { tx: hit, kind: 'exact', days: 0 }
    }
  })

  // Pass 2: same amount and direction, nearby date; closest date first, then most similar text
  const pairs: Array<{ i: number; t: Transaction; days: number; score: number }> = []
  rows.forEach((r, i) => {
    if (!r || result[i]) return
    const day = dayNumber(r.date)
    for (const t of byAmount.get(`${r.direction}|${r.amount.toFixed(2)}`) ?? []) {
      if (used.has(t.id) || !sameCurrency(r, t)) continue
      const days = Math.abs(dayNumber(t.date) - day)
      if (!Number.isFinite(days) || days > maxDays) continue
      pairs.push({ i, t, days, score: days - similarity(r.description, t.description) * 2 })
    }
  })
  pairs.sort((a, b) => a.score - b.score)
  for (const p of pairs) {
    if (result[p.i] || used.has(p.t.id)) continue
    used.add(p.t.id)
    result[p.i] = { tx: p.t, kind: 'likely', days: p.days }
  }
  return result
}

function sameCurrency(a: { currency: string }, b: { currency: string }) {
  return !a.currency || !b.currency || a.currency.toUpperCase() === b.currency.toUpperCase()
}
