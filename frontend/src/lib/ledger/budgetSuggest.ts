import { isTransfer } from './categorize'
import { inSpan, type Span } from './summary'
import type { Transaction } from './types'

/**
 * Suggested monthly limits from what was actually spent (design: Budgets → "Set monthly limits").
 * Per category: spending in each of the last periods, a suggestion, and a note when one period was
 * unusually high (e.g. two rent payments landing in one month), which the suggestion leaves out.
 */

export interface LimitSuggestion {
  category: string
  /** Spending per period, oldest first, same order as the spans passed in */
  amounts: number[]
  /** Suggested limit, rounded up; null when nothing was spent */
  suggested: number | null
  /** A period left out of the suggestion because it was far above the others */
  spike?: { index: number; amount: number }
}

/** A period counts as a spike when it is this many times the highest of the other periods. */
export const SPIKE_FACTOR = 1.6

const r2 = (n: number) => Math.round(n * 100) / 100

/** Rounds a limit up to a friendly step: 5 below 100, 10 below 1,000, 50 above. */
export function roundLimit(n: number): number {
  if (n <= 0) return 0
  const step = n < 100 ? 5 : n < 1000 ? 10 : 50
  return Math.ceil(n / step) * step
}

export function suggestLimits(transactions: Transaction[], spans: Span[], currency: string): LimitSuggestion[] {
  const by = new Map<string, number[]>()
  for (const t of transactions) {
    if (t.direction !== 'out' || isTransfer(t) || t.currency !== currency) continue
    const i = spans.findIndex((s) => inSpan(t.date, s))
    if (i < 0) continue
    const row = by.get(t.category || 'Other') ?? spans.map(() => 0)
    row[i] += t.amount
    by.set(t.category || 'Other', row)
  }
  return [...by.entries()]
    .map(([category, raw]) => {
      const amounts = raw.map(r2)
      const nonZero = amounts.map((a, index) => ({ a, index })).filter((x) => x.a > 0)
      let spike: LimitSuggestion['spike']
      let basis = nonZero
      if (nonZero.length >= 2) {
        const top = nonZero.reduce((m, x) => (x.a > m.a ? x : m))
        const others = nonZero.filter((x) => x !== top).map((x) => x.a)
        // Compared with the highest other month, so one quiet month does not make a normal one look like a spike
        if (top.a >= SPIKE_FACTOR * Math.max(...others)) {
          spike = { index: top.index, amount: top.a }
          basis = nonZero.filter((x) => x !== top)
        }
      }
      const suggested = basis.length ? roundLimit(Math.max(...basis.map((x) => x.a))) : null
      return { category, amounts, suggested, ...(spike ? { spike } : {}) }
    })
    .sort((a, b) => b.amounts.reduce((s, x) => s + x, 0) - a.amounts.reduce((s, x) => s + x, 0))
}
