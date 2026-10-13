import type { Transaction } from './types'

/** Pure calculations for the Overview. Amounts are never mixed across currencies. */

export const ym = (date: string) => date.slice(0, 7)

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthName(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

/** Currencies ordered by how often they are used (most used first). */
export function currenciesByUse(tx: Transaction[]): string[] {
  const n = new Map<string, number>()
  for (const t of tx) if (t.currency) n.set(t.currency, (n.get(t.currency) ?? 0) + 1)
  return Array.from(n.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

/** Latest month that has data, or the current month. */
export function defaultMonth(tx: Transaction[]): string {
  const now = currentMonth()
  if (tx.some((t) => ym(t.date) === now)) return now
  const months = tx.map((t) => ym(t.date)).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort()
  return months.length ? months[months.length - 1] : now
}

export interface MonthTotals {
  income: number
  spending: number
  net: number
  count: number
}

export function totalsFor(tx: Transaction[], month: string, currency: string): MonthTotals {
  let income = 0
  let spending = 0
  let count = 0
  for (const t of tx) {
    if (ym(t.date) !== month || t.currency !== currency) continue
    count++
    if (t.direction === 'in') income += t.amount
    else spending += t.amount
  }
  const r = (x: number) => Math.round(x * 100) / 100
  return { income: r(income), spending: r(spending), net: r(income - spending), count }
}

export interface CategoryShare {
  category: string
  amount: number
  share: number // 0..1 of total spending
  count: number
}

/** Spending by category, largest first; anything past `top` folds into "Everything else". */
export function spendingByCategory(tx: Transaction[], month: string, currency: string, top = 7): CategoryShare[] {
  const sums = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const t of tx) {
    if (t.direction !== 'out' || ym(t.date) !== month || t.currency !== currency) continue
    const k = t.category || 'Other'
    const s = sums.get(k) ?? { amount: 0, count: 0 }
    s.amount += t.amount
    s.count++
    sums.set(k, s)
    total += t.amount
  }
  const rows = Array.from(sums.entries())
    .map(([category, s]) => ({ category, amount: Math.round(s.amount * 100) / 100, count: s.count, share: total ? s.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
  if (rows.length <= top) return rows
  const rest = rows.slice(top - 1)
  const restAmount = rest.reduce((a, r) => a + r.amount, 0)
  return [
    ...rows.slice(0, top - 1),
    { category: 'Everything else', amount: Math.round(restAmount * 100) / 100, count: rest.reduce((a, r) => a + r.count, 0), share: total ? restAmount / total : 0 },
  ]
}

export interface TrendPoint extends MonthTotals {
  month: string
}

export function trend(tx: Transaction[], endMonth: string, currency: string, months = 6): TrendPoint[] {
  return Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(endMonth, i - (months - 1))
    return { month, ...totalsFor(tx, month, currency) }
  })
}

export interface AccountFlow {
  account: string
  income: number
  spending: number
  count: number
}

export function byAccount(tx: Transaction[], month: string, currency: string): AccountFlow[] {
  const m = new Map<string, AccountFlow>()
  for (const t of tx) {
    if (ym(t.date) !== month || t.currency !== currency) continue
    const k = t.account || 'No account'
    const a = m.get(k) ?? { account: k, income: 0, spending: 0, count: 0 }
    if (t.direction === 'in') a.income += t.amount
    else a.spending += t.amount
    a.count++
    m.set(k, a)
  }
  return Array.from(m.values()).sort((a, b) => b.income + b.spending - (a.income + a.spending))
}

/** Percentage change, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null
  return (now - before) / before
}
