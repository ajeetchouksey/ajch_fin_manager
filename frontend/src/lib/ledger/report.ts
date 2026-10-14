/**
 * The monthly report: one set of figures for the app's Report page, the Google Doc saved from it,
 * and the AI connector. A cause is only named when the data shows it (a new payee, a single payment
 * of the same size). Anything else is written as "driver to be confirmed".
 */
import { isTransfer } from './categorize'
import { budgetProgress, type Budget, type BudgetProgress } from './budgets'
import { buildPeriods, periodContaining, type PeriodMode } from './periods'
import { change, inSpan, spendingByCategory, totalsFor, type Span } from './summary'
import { formatMoney, type Transaction } from './types'

export const REPORT_DEFAULTS = { thresholdPercent: 20, minAmount: 50 }

export interface ReportLine {
  label: string
  current: number
  previous: number | null
  /** Change as a fraction of the previous amount; null when there was none */
  change: number | null
  /** Moved beyond the watch threshold */
  flag: boolean
  /** The cause, or "driver to be confirmed" */
  note: string
}

export interface Report {
  currency: string
  label: string
  previousLabel: string | null
  start: string
  end: string
  open: boolean
  expectedEnd?: string
  headline: string[]
  metrics: ReportLine[]
  categories: ReportLine[]
  watchList: ReportLine[]
  budgets: BudgetProgress[]
  basis: string
}

/** The period to report on: the latest with data, or the one containing `date`. */
export function choosePeriod(transactions: Transaction[], mode: PeriodMode, today: string, date?: string) {
  const salary = mode === 'salary' ? buildPeriods('salary', transactions, today) : []
  const fellBack = mode === 'salary' && !salary.length
  const periods = mode === 'calendar' || fellBack ? buildPeriods('calendar', transactions, today) : salary
  const withData = periods.filter((p) => transactions.some((t) => inSpan(t.date, p)))
  const chosen = date ? periodContaining(date, periods) : (withData.at(-1) ?? periods.at(-1))
  const idx = chosen ? periods.indexOf(chosen) : -1
  return {
    periods,
    chosen: chosen ?? null,
    previous: idx > 0 ? periods[idx - 1] : null,
    next: idx >= 0 && idx < periods.length - 1 ? periods[idx + 1] : null,
    fellBack,
  }
}

type DateRange = { start: string; end: string }

const r2 = (n: number) => Math.round(n * 100) / 100
const DRIVER_UNKNOWN = 'driver to be confirmed'

/** Payees in a category for a span, with what was paid to each. */
function payeesIn(transactions: Transaction[], span: Span, category: string, currency: string): Map<string, { amount: number; count: number; name: string }> {
  const m = new Map<string, { amount: number; count: number; name: string }>()
  for (const t of transactions) {
    if (t.direction !== 'out' || t.currency !== currency || !inSpan(t.date, span) || isTransfer(t) || (t.category || 'Other') !== category) continue
    const key = t.description.trim().toLowerCase().slice(0, 30)
    const e = m.get(key) ?? { amount: 0, count: 0, name: t.description.trim().slice(0, 40) }
    e.amount += t.amount
    e.count++
    m.set(key, e)
  }
  return m
}

/** Explains a category move only when the data shows why; otherwise says the driver is unknown. */
function explainCategory(
  transactions: Transaction[],
  span: Span,
  prevSpan: Span | null,
  category: string,
  currency: string,
  delta: number,
): string {
  if (!prevSpan) return DRIVER_UNKNOWN
  const now = payeesIn(transactions, span, category, currency)
  const before = payeesIn(transactions, prevSpan, category, currency)
  const tolerance = Math.max(1, Math.abs(delta) * 0.01)

  // One payment that is exactly the move: a timing or one-off case, worth checking
  const single = [...now.entries()].find(([k, v]) => !before.has(k) && v.count === 1 && Math.abs(v.amount - Math.abs(delta)) <= tolerance)
  if (delta > 0 && single) return `one new payment of ${formatMoney(single[1].amount, currency)} to ${single[1].name}; check whether it recurs or was timing`
  const gone = [...before.entries()].find(([k, v]) => !now.has(k) && v.count === 1 && Math.abs(v.amount - Math.abs(delta)) <= tolerance)
  if (delta < 0 && gone) return `one payment of ${formatMoney(gone[1].amount, currency)} to ${gone[1].name} did not happen this period; check whether it was timing`

  const newPayees = [...now.entries()].filter(([k]) => !before.has(k))
  const newSum = newPayees.reduce((s, [, v]) => s + v.amount, 0)
  if (delta > 0 && newPayees.length && newSum >= Math.abs(delta) * 0.8) {
    const names = newPayees.sort((a, b) => b[1].amount - a[1].amount).slice(0, 2).map(([, v]) => v.name)
    return `mostly new payees: ${names.join(', ')}`
  }
  const countNow = [...now.values()].reduce((s, v) => s + v.count, 0)
  const countBefore = [...before.values()].reduce((s, v) => s + v.count, 0)
  if (countNow !== countBefore) return `${Math.abs(countNow - countBefore)} ${countNow > countBefore ? 'more' : 'fewer'} payments than the previous period`
  return DRIVER_UNKNOWN
}

/** Builds the report for one period (and its previous period, when given). */
export function buildReport(input: {
  transactions: Transaction[]
  budgets: Budget[]
  currency: string
  span: DateRange
  label: string
  open?: boolean
  expectedEnd?: string
  previous?: { span: DateRange; label: string } | null
  thresholdPercent?: number
  minAmount?: number
}): Report {
  const { transactions, currency, span } = input
  const threshold = (input.thresholdPercent ?? REPORT_DEFAULTS.thresholdPercent) / 100
  const minAmount = input.minAmount ?? REPORT_DEFAULTS.minAmount
  const now = totalsFor(transactions, span, currency)
  const prev = input.previous ? totalsFor(transactions, input.previous.span, currency) : null
  const prevSpan = input.previous?.span ?? null

  const rate = (t: { income: number; net: number }) => (t.income > 0 ? (t.net / t.income) * 100 : null)
  const metricLine = (label: string, c: number, p: number | null, note = ''): ReportLine => ({
    label,
    current: c,
    previous: p,
    change: p === null ? null : change(c, p),
    flag: false,
    note,
  })
  const metrics: ReportLine[] = [
    metricLine('Money in', now.income, prev?.income ?? null),
    metricLine('Money out', now.spending, prev?.spending ?? null),
    metricLine('Left over', now.net, prev?.net ?? null),
    {
      label: 'Savings rate (percent of money in)',
      current: rate(now) === null ? 0 : r2(rate(now)!),
      previous: prev && rate(prev) !== null ? r2(rate(prev)!) : null,
      change: null,
      flag: false,
      note: rate(now) === null ? 'no money in this period' : '',
    },
  ]

  // Categories: every one that has money out now or before
  const curCats = new Map(spendingByCategory(transactions, span, currency, 1000).map((c) => [c.category, c.amount]))
  const prevCats = new Map(prevSpan ? spendingByCategory(transactions, prevSpan, currency, 1000).map((c) => [c.category, c.amount]) : [])
  const names = Array.from(new Set([...curCats.keys(), ...prevCats.keys()]))
  const categories: ReportLine[] = names
    .map((category) => {
      const current = r2(curCats.get(category) ?? 0)
      const previous = prevSpan ? r2(prevCats.get(category) ?? 0) : null
      const delta = current - (previous ?? 0)
      const c = previous ? change(current, previous) : null
      const moved = Math.abs(delta) >= minAmount && (c === null ? previous === null || previous === 0 : Math.abs(c) >= threshold)
      const flag = prevSpan !== null && moved
      const note = prevSpan && (flag || Math.abs(delta) >= minAmount) ? explainCategory(transactions, span, prevSpan, category, currency, delta) : ''
      return { label: category, current, previous, change: c, flag, note }
    })
    .sort((a, b) => Math.abs((b.current - (b.previous ?? 0))) - Math.abs((a.current - (a.previous ?? 0))))

  const watchList = categories.filter((c) => c.flag)
  const budgets = budgetProgress(input.budgets, transactions, span, currency)

  // Headline: three sentences at most, each one a fact from the figures above
  const headline: string[] = [
    `In ${input.label} you received ${formatMoney(now.income, currency)} and spent ${formatMoney(now.spending, currency)}, leaving ${formatMoney(now.net, currency)}${rate(now) !== null ? ` (${Math.round(rate(now)!)}% of money in)` : ''}.`,
  ]
  if (prev && input.previous) {
    const d = now.spending - prev.spending
    const dir = d > 0 ? 'up' : 'down'
    const biggest = [...categories].filter((c) => c.flag).sort((a, b) => Math.abs(b.current - (b.previous ?? 0)) - Math.abs(a.current - (a.previous ?? 0)))[0]
    headline.push(
      Math.abs(d) < 1
        ? `Spending was about the same as in ${input.previous.label}.`
        : `Spending was ${dir} ${formatMoney(Math.abs(d), currency)}${change(now.spending, prev.spending) !== null ? ` (${Math.round(Math.abs(change(now.spending, prev.spending)!) * 100)}%)` : ''} compared with ${input.previous.label}${biggest && d > 0 ? `, most of it in ${biggest.label}` : ''}.`,
    )
  }
  const over = budgets.filter((b) => b.state === 'over').length
  const warn = budgets.filter((b) => b.state === 'warn').length
  if (budgets.length) headline.push(over || warn ? `${over} budget${over === 1 ? '' : 's'} over and ${warn} close to the limit.` : 'All budgets are within their limits.')

  return {
    currency,
    label: input.label,
    previousLabel: input.previous?.label ?? null,
    start: span.start,
    end: span.end,
    open: input.open ?? false,
    expectedEnd: input.expectedEnd,
    headline: headline.slice(0, 3),
    metrics,
    categories,
    watchList,
    budgets,
    basis: `Actual figures from the Ledger for ${input.label}${input.previous ? `, compared with ${input.previous.label}` : ''}. Watch list: moved at least ${Math.round(threshold * 100)}% and ${formatMoney(minAmount, currency)}. Transfers between your own accounts are left out.`,
  }
}

/** The report as plain HTML for a Google Doc (escaped; no scripts). */
export function reportToHtml(r: Report, title: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const money = (n: number) => formatMoney(n, r.currency)
  const pct = (f: number | null) => (f === null ? '–' : `${f > 0 ? '+' : ''}${Math.round(f * 100)}%`)
  const value = (l: ReportLine, n: number | null) => (n === null ? '–' : l.label.startsWith('Savings rate') ? `${Math.round(n)}%` : money(n))
  const rows = (lines: ReportLine[]) =>
    lines
      .map((l) => `<tr><td>${esc(l.label)}</td><td style="text-align:right">${value(l, l.current)}</td><td style="text-align:right">${value(l, l.previous)}</td><td style="text-align:right">${pct(l.change)}</td><td>${esc(l.note || (l.flag ? DRIVER_UNKNOWN : ''))}</td></tr>`)
      .join('')
  const head = '<tr><th>Item</th><th>This period</th><th>Previous</th><th>Change</th><th>Note</th></tr>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:Arial,sans-serif">
<h1>${esc(title)}</h1>
<p>${esc(r.label)}${r.open ? ' (so far)' : ''}${r.expectedEnd ? `, expected to end ${esc(r.expectedEnd)}` : ''}</p>
<h2>Headline</h2>${r.headline.map((h) => `<p>${esc(h)}</p>`).join('')}
<h2>Figures</h2><table border="1" cellspacing="0" cellpadding="4">${head}${rows(r.metrics)}</table>
<h2>Watch list</h2>${r.watchList.length ? `<table border="1" cellspacing="0" cellpadding="4">${head}${rows(r.watchList)}</table>` : '<p>Nothing moved beyond the watch threshold.</p>'}
<h2>All categories</h2><table border="1" cellspacing="0" cellpadding="4">${head}${rows(r.categories)}</table>
<h2>Budgets</h2>${r.budgets.length ? `<ul>${r.budgets.map((b) => `<li>${esc(b.category)}: ${money(b.spent)} of ${money(b.limit)} (${b.state})</li>`).join('')}</ul>` : '<p>No budgets set.</p>'}
<p style="color:#666;font-size:12px">${esc(r.basis)}</p>
</body></html>`
}
