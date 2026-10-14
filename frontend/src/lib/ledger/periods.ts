/**
 * Periods for the whole app: a calendar month, or a salary cycle (one salary credit to the day
 * before the next). Overview, Insights, Transactions and the AI connector all use these boundaries,
 * so the same question gets the same answer everywhere.
 *
 * Dates are YYYY-MM-DD and all arithmetic is in UTC, so the result never depends on the time zone.
 */
import type { Transaction } from './types'

export type PeriodMode = 'calendar' | 'salary'

export interface Period {
  /** First day, YYYY-MM-DD */
  start: string
  /** Last day, YYYY-MM-DD; for an open cycle, the last day with data */
  end: string
  kind: PeriodMode
  /** Leading part of a salary history, before the first salary credit */
  partial?: boolean
  /** The cycle that has not closed yet */
  open?: boolean
  /** Where an open cycle is expected to end (the day before the predicted next salary) */
  expectedEnd?: string
}

const DAY_MS = 86_400_000

const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (iso: string, days: number): string => isoOf(utc(iso) + days * DAY_MS)

/** Whole days from a to b (negative when b is earlier). */
export const daysBetween = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY_MS)

/** 0 = Sunday … 6 = Saturday */
const weekday = (iso: string): number => new Date(utc(iso)).getUTCDay()

export function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The calendar month that contains the date. */
export function calendarPeriod(date: string): Period {
  const start = `${date.slice(0, 7)}-01`
  const [y, m] = start.split('-').map(Number)
  const end = isoOf(Date.UTC(y, m, 0)) // day 0 of the next month is the last day of this one
  return { start, end, kind: 'calendar' }
}

/**
 * Dates of the salary credits. A credit counts when it is money in, categorised as Salary, and at
 * least half the median salary, so small top-ups do not start a new cycle. An employer name narrows
 * it further when the user has several salary-type incomes.
 */
export function salaryCreditDates(transactions: Transaction[], employer?: string): string[] {
  const needle = employer?.trim().toLowerCase()
  const credits = transactions.filter(
    (t) => t.direction === 'in' && t.category === 'Salary' && (!needle || t.description.toLowerCase().includes(needle)),
  )
  if (!credits.length) return []
  const threshold = median(credits.map((t) => t.amount)) * 0.5
  return [...new Set(credits.filter((t) => t.amount >= threshold).map((t) => t.date))].sort()
}

/**
 * Predicts the next salary date from the median gap between credits. Banks do not book on
 * weekends, so a Saturday or Sunday moves to the Monday.
 */
export function predictNextSalary(dates: string[]): string | null {
  if (dates.length < 2) return null
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
  const next = addDays(dates[dates.length - 1], Math.round(median(gaps)))
  const wd = weekday(next)
  return wd === 6 ? addDays(next, 2) : wd === 0 ? addDays(next, 1) : next
}

/**
 * Salary cycles, oldest first. Each runs from one salary credit to the day before the next. A
 * history that starts before the first credit gets a partial leading period. The newest cycle is
 * open: it ends at `asOf` and is expected to end the day before the predicted next salary.
 */
export function salaryPeriods(dates: string[], asOf: string, firstDate?: string): Period[] {
  if (!dates.length) return []
  const periods: Period[] = []
  if (firstDate && firstDate < dates[0]) {
    periods.push({ start: firstDate, end: addDays(dates[0], -1), kind: 'salary', partial: true })
  }
  const next = predictNextSalary(dates)
  dates.forEach((start, i) => {
    const following = dates[i + 1]
    if (following) {
      periods.push({ start, end: addDays(following, -1), kind: 'salary' })
      return
    }
    const end = asOf >= start ? asOf : start
    const expected = next ? addDays(next, -1) : end
    periods.push({ start, end, kind: 'salary', open: true, expectedEnd: expected > end ? expected : end })
  })
  return periods
}

/**
 * All periods covering the transactions, oldest first, up to `asOf`. Calendar mode lists every
 * month from the first transaction; salary mode lists every cycle from the salary history.
 */
export function buildPeriods(mode: PeriodMode, transactions: Transaction[], asOf: string, employer?: string): Period[] {
  if (!transactions.length) return []
  const first = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date)
  if (mode === 'calendar') {
    const out: Period[] = []
    for (let p = calendarPeriod(first); p.start <= asOf; p = calendarPeriod(addDays(p.end, 1))) out.push(p)
    return out
  }
  return salaryPeriods(salaryCreditDates(transactions, employer), asOf, first)
}

/** The period that contains a date, or null when it falls outside the given periods. */
export function periodContaining(date: string, periods: Period[]): Period | null {
  return periods.find((p) => date >= p.start && date <= p.end) ?? null
}
