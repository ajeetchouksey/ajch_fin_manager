import { change, type MonthTotals } from './summary'
import { formatMoney } from './types'

/** Date `days` after (or before, if negative) an ISO date, without timezone drift. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The last seven days including today, and the seven before them. */
export function weekSpans(today: string): { now: { start: string; end: string }; before: { start: string; end: string } } {
  return {
    now: { start: addDays(today, -6), end: today },
    before: { start: addDays(today, -13), end: addDays(today, -7) },
  }
}

/**
 * The headline sentences for one period, in plain words. The comparison is only given when the earlier
 * period has transactions, so a first month never claims a change.
 */
export function headlineLines(now: MonthTotals, before: MonthTotals, noun: string, previousNoun: string, currency: string): string[] {
  if (now.count === 0) return [`No transactions ${noun}.`]
  const lines = [`You spent ${formatMoney(now.spending, currency)} and received ${formatMoney(now.income, currency)} ${noun}.`]
  lines.push(
    now.net >= 0
      ? `You kept ${formatMoney(now.net, currency)}.`
      : `You spent ${formatMoney(-now.net, currency)} more than you received.`,
  )
  const delta = change(now.spending, before.spending)
  if (before.count > 0 && delta !== null) {
    const pct = Math.round(Math.abs(delta) * 100)
    lines.push(pct === 0 ? `Spending is level with ${previousNoun}.` : `Spending is ${pct}% ${delta > 0 ? 'higher' : 'lower'} than ${previousNoun}.`)
  }
  return lines
}
