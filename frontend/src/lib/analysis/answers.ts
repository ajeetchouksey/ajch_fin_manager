/**
 * Answers to the assistant's ready-made questions, worked out from the Ledger in the browser.
 * No AI is involved: every figure here comes from the user's own transactions.
 */
import { isTransfer, merchantText } from '../ledger/categorize'
import type { Transaction } from '../ledger/types'

export interface MonthSpend {
  month: string // YYYY-MM
  spending: number
  income: number
}

const OTHER = /^other( income)?$/i
const counts = (t: Transaction, currency: string) => t.currency === currency && !isTransfer(t)

/** Short payee name, like the lists show it. */
export function shortPayee(t: Transaction): string {
  return merchantText(t.description).split(/\s[—–-]\s|,|\//)[0].trim().slice(0, 48) || t.description.slice(0, 48)
}

/** Spending and income per calendar month of one year, from the first to the last month with data. */
export function monthlySpend(tx: Transaction[], currency: string, year: string): MonthSpend[] {
  const map = new Map<string, MonthSpend>()
  let first = 13
  let last = 0
  for (const t of tx) {
    if (!t.date.startsWith(year) || !counts(t, currency)) continue
    const month = t.date.slice(0, 7)
    first = Math.min(first, Number(month.slice(5)))
    last = Math.max(last, Number(month.slice(5)))
    const m = map.get(month) ?? { month, spending: 0, income: 0 }
    if (t.direction === 'out') m.spending += t.amount
    else m.income += t.amount
    map.set(month, m)
  }
  const out: MonthSpend[] = []
  for (let i = first; i <= last; i++) {
    const month = `${year}-${String(i).padStart(2, '0')}`
    out.push(map.get(month) ?? { month, spending: 0, income: 0 })
  }
  return out
}

export interface ExpensiveMonth extends MonthSpend {
  /** The biggest single payment in the month and its share of the month's spending */
  largest?: { name: string; amount: number; category: string; share: number }
  /** Money out still in "Other" that month */
  other: { amount: number; count: number }
  /** The next-biggest category after the largest payment's, for the summary */
  rest: Array<{ category: string; amount: number }>
}

/** The month with the most spending in a year, and what made it so. Null when nothing was spent. */
export function expensiveMonth(tx: Transaction[], currency: string, year: string): ExpensiveMonth | null {
  const months = monthlySpend(tx, currency, year)
  const top = [...months].sort((a, b) => b.spending - a.spending)[0]
  if (!top || top.spending <= 0) return null
  const out = tx.filter((t) => t.date.startsWith(top.month) && t.direction === 'out' && counts(t, currency))
  const big = [...out].sort((a, b) => b.amount - a.amount)[0]
  const other = out.filter((t) => OTHER.test(t.category))
  const byCat = new Map<string, number>()
  for (const t of out) if (t !== big && !OTHER.test(t.category)) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount)
  return {
    ...top,
    largest: big ? { name: shortPayee(big), amount: big.amount, category: big.category, share: big.amount / top.spending } : undefined,
    other: { amount: other.reduce((a, t) => a + t.amount, 0), count: other.length },
    rest: [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([category, amount]) => ({ category, amount })),
  }
}

export type YearCompare =
  | { kind: 'compare'; months: number; thisYear: number; lastYear: number; throughMonth: string }
  | { kind: 'no-history'; firstMonth: string }
  | { kind: 'empty' }

/** This year so far against the same months last year. */
export function yearOnYear(tx: Transaction[], currency: string): YearCompare {
  const dated = tx.filter((t) => counts(t, currency))
  if (!dated.length) return { kind: 'empty' }
  const latest = dated.reduce((m, t) => (t.date > m ? t.date : m), '')
  const first = dated.reduce((m, t) => (t.date < m ? t.date : m), latest)
  const year = Number(latest.slice(0, 4))
  const through = latest.slice(5, 7)
  const lastYear = `${year - 1}`
  if (first.slice(0, 7) > `${lastYear}-01`) return { kind: 'no-history', firstMonth: first.slice(0, 7) }
  const sum = (y: string) => dated.filter((t) => t.direction === 'out' && t.date.startsWith(y) && t.date.slice(5, 7) <= through).reduce((a, t) => a + t.amount, 0)
  return { kind: 'compare', months: Number(through), thisYear: sum(`${year}`), lastYear: sum(lastYear), throughMonth: latest.slice(0, 7) }
}
