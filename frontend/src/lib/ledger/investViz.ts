import type { Account, BalanceEntry } from './portfolio'
import { accountType } from './portfolio'
import type { PutInRow } from './allocation'
import { monthlyEquivalent, planState, type Plan } from './plans'
import { futureValue, type GoalScenario } from './scenarios'
import type { ReviewHolding } from './review'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Last day of the month that is `back` months before the month of `today`. */
function monthEnd(today: string, back: number): string {
  const [y, m] = today.split('-').map(Number)
  return iso(new Date(Date.UTC(y, m - 1 - back + 1, 0)))
}

export interface WorthPoint {
  date: string
  value: number
}

export interface WorthSeries {
  currency: string
  points: WorthPoint[]
  /** Accounts that had no record yet at the start and joined later; the line steps up when they do */
  joinedLater: string[]
}

/**
 * What the investment and retirement accounts in one currency were worth at each month end, from the balances the person recorded.
 * An account counts from its first record on, and its last known balance carries forward. The last point is today.
 */
export function worthSeries(accounts: Account[], history: BalanceEntry[], currency: string, today: string, months = 24): WorthSeries {
  const own = accounts.filter((a) => a.currency.toUpperCase() === currency.toUpperCase() && ['investments', 'retirement'].includes(accountType(a.type).group))
  const records = own.map((a) => {
    const rows = history.filter((h) => h.accountId === a.id && h.date.slice(0, 10) <= today).map((h) => ({ date: h.date.slice(0, 10), balance: h.balance }))
    if (a.asOf && a.asOf.slice(0, 10) <= today && !rows.some((r) => r.date === a.asOf.slice(0, 10))) rows.push({ date: a.asOf.slice(0, 10), balance: a.balance })
    rows.sort((x, y) => x.date.localeCompare(y.date))
    return { account: a, rows }
  })
  const dates: string[] = []
  for (let back = months; back >= 1; back--) dates.push(monthEnd(today, back))
  dates.push(today)
  const valueAt = (rows: Array<{ date: string; balance: number }>, d: string) => {
    let found: number | null = null
    for (const r of rows) if (r.date <= d) found = r.balance
    return found
  }
  const points: WorthPoint[] = []
  for (const d of dates) {
    let sum = 0
    let any = false
    for (const r of records) {
      const v = valueAt(r.rows, d)
      if (v !== null) {
        sum += v
        any = true
      }
    }
    if (any) points.push({ date: d, value: Math.round(sum * 100) / 100 })
  }
  const first = points[0]?.date
  const joinedLater = first ? records.filter((r) => r.rows.length > 0 && r.rows[0].date > first).map((r) => r.account.name) : []
  return { currency, points, joinedLater }
}

export interface Totals {
  currency: string
  worth: number
  putIn: number
  change: number
  changeShare: number | null
  /** Planned monthly investing that is running now */
  planned: number
}

/** Worth, put in and the monthly plan, per currency. */
export function investTotals(rows: PutInRow[], plans: Plan[], today: string): Totals[] {
  const out = new Map<string, Totals>()
  const get = (c: string) => {
    const k = c.toUpperCase()
    if (!out.has(k)) out.set(k, { currency: k, worth: 0, putIn: 0, change: 0, changeShare: null, planned: 0 })
    return out.get(k)!
  }
  for (const r of rows) {
    const t = get(r.currency)
    t.worth += r.worth
    t.putIn += r.putIn
  }
  for (const p of plans) if (planState(p, today) === 'running') get(p.currency).planned += monthlyEquivalent(p)
  for (const t of out.values()) {
    t.worth = Math.round(t.worth * 100) / 100
    t.putIn = Math.round(t.putIn * 100) / 100
    t.planned = Math.round(t.planned * 100) / 100
    t.change = Math.round((t.worth - t.putIn) * 100) / 100
    t.changeShare = t.putIn > 0 ? Math.round((t.change / t.putIn) * 10000) / 10000 : null
  }
  return [...out.values()].filter((t) => t.worth !== 0 || t.putIn !== 0 || t.planned !== 0).sort((a, b) => b.worth - a.worth)
}

export interface BandSeries {
  id: string
  label: string
  rate: number
  /** Value after 0, 1, 2 ... `months` months */
  values: number[]
}

export interface GoalBand {
  months: number
  target: number
  series: BandSeries[]
}

/** The three illustrative cases for a goal, month by month up to its date, to draw against the target. */
export function goalBand(s: GoalScenario): GoalBand {
  const series = s.cases.map((c) => ({
    id: c.id,
    label: c.label,
    rate: c.rate,
    values: Array.from({ length: s.months + 1 }, (_, m) => Math.round(futureValue(s.current, s.monthly, m, c.rate) * 100) / 100),
  }))
  return { months: s.months, target: s.target, series }
}

/** Share of the target already set aside, 0 to 1. */
export const goalProgress = (s: Pick<GoalScenario, 'current' | 'target'>) => (s.target > 0 ? Math.max(0, Math.min(1, s.current / s.target)) : 0)

/** Holdings with a price, best first, for the gain chart. */
export function rankedGains(rows: ReviewHolding[]): ReviewHolding[] {
  return rows.filter((h) => h.value !== null && h.gainShare !== null).sort((a, b) => (b.gainShare ?? 0) - (a.gainShare ?? 0))
}
