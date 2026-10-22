import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText, Printer } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { useLedger } from '../context/LedgerContext'
import { isTransfer } from '../lib/ledger/categorize'
import { categoryColor } from '../lib/ledger/categoryColors'
import { CATEGORY_GROUPS, groupColor, groupOf } from '../lib/ledger/categoryGroups'
import { groupPayees } from '../lib/ledger/payees'
import { currenciesByUse, monthName } from '../lib/ledger/summary'
import { formatMoney, todayIso, type Transaction } from '../lib/ledger/types'
import { payeeName } from '../components/overview/RecentTable'
import { privately } from '../lib/ledger/privacy'

type Range = 'year' | '6m' | '12m' | 'lastyear'
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'year', label: 'This year' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'lastyear', label: 'Last year' },
]

const ymAdd = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthsOf(range: Range, today: string): string[] {
  const now = today.slice(0, 7)
  const year = today.slice(0, 4)
  const span = (from: string, to: string) => {
    const out: string[] = []
    for (let m = from; m <= to; m = ymAdd(m, 1)) out.push(m)
    return out
  }
  if (range === 'year') return span(`${year}-01`, now)
  if (range === 'lastyear') return span(`${Number(year) - 1}-01`, `${Number(year) - 1}-12`)
  return span(ymAdd(now, range === '6m' ? -5 : -11), now)
}
const csvCell = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Reports (design): totals, income vs spending, spending mix by month, top payees, tax-year helper, exports. */
export function ReportsPage() {
  const { status, transactions } = useLedger()
  const [range, setRange] = useState<Range>('year')
  const today = todayIso()
  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? 'EUR', [transactions])
  // The range, starting at the first month that has any transaction (no flat zero line before the Ledger starts)
  const firstMonth = useMemo(() => transactions.reduce((m, t) => (!m || t.date < m ? t.date : m), '').slice(0, 7), [transactions])
  const months = useMemo(() => {
    const all = monthsOf(range, today)
    const from = all.filter((m) => m >= firstMonth)
    return from.length ? from : all
  }, [range, today, firstMonth])

  const inRange = useMemo(
    () => transactions.filter((t) => t.currency === currency && months.includes(t.date.slice(0, 7))),
    [transactions, months, currency],
  )
  const money = inRange.filter((t) => !isTransfer(t))
  const series = useMemo(
    () =>
      months.map((m) => {
        const list = money.filter((t) => t.date.startsWith(m))
        const income = list.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
        const spending = list.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)
        const groups = CATEGORY_GROUPS.map((g) => list.filter((t) => t.direction === 'out' && groupOf(t.category) === g).reduce((s, t) => s + t.amount, 0))
        return { m, income, spending, groups }
      }),
    [months, money],
  )
  const income = series.reduce((s, x) => s + x.income, 0)
  const spending = series.reduce((s, x) => s + x.spending, 0)
  const biggest = series.reduce((a, b) => (b.spending > a.spending ? b : a), series[0])
  const biggestPayment: Transaction | undefined = biggest
    ? money.filter((t) => t.direction === 'out' && t.date.startsWith(biggest.m)).sort((a, b) => b.amount - a.amount)[0]
    : undefined
  const withData = series.filter((s) => s.income || s.spending)
  const first = inRange.reduce((m, t) => (!m || t.date < m ? t.date : m), '')
  const last = inRange.reduce((m, t) => (t.date > m ? t.date : m), '')

  // Top payees by money out in the range
  const payees = useMemo(
    () =>
      groupPayees(money.filter((t) => t.direction === 'out'))
        .map((g) => ({ g, total: g.tx.reduce((s, t) => s + t.amount, 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [money],
  )
  const otherCount = (txs: Transaction[]) => txs.filter((t) => /^other$/i.test(t.category)).length

  // Tax helper: this calendar year's totals for categories that often matter for a tax return
  const taxYear = today.slice(0, 4)
  const taxLines = useMemo(() => {
    const yearTx = transactions.filter((t) => t.date.startsWith(taxYear) && t.direction === 'out' && t.currency === currency && !isTransfer(t))
    const sum = (cats: string[]) => yearTx.filter((t) => cats.includes(t.category)).reduce((s, t) => s + t.amount, 0)
    return [
      { label: 'Health and health insurance', value: sum(['Health']) },
      { label: 'Insurance', value: sum(['Insurance']) },
      { label: 'Childcare and education', value: sum(['Childcare', 'Education']) },
      { label: 'Donations', value: sum(['Gifts & donations']) },
      { label: 'Tax paid or tax advice', value: sum(['Taxes']) },
    ]
  }, [transactions, taxYear, currency])

  const exportCsv = () => {
    const head = ['date', 'direction', 'amount', 'currency', 'category', 'description', 'account', 'notes', 'tags']
    const rows = [...inRange].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.direction, t.amount, t.currency, t.category, t.description, t.account, t.notes, t.tags.join(', ')])
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-${months[0]}-to-${months.at(-1)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Reports" />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </>
    )
  }

  // Line chart geometry (viewBox units)
  const W = 880, H = 260, L = 56, R = 870, T = 20, B = 230
  const top = Math.max(1000, ...series.flatMap((s) => [s.income, s.spending]))
  const step = (() => { const raw = top / 4; const p = 10 ** Math.floor(Math.log10(raw)); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((v) => v >= raw)! })()
  const max = step * 4
  const x = (i: number) => (series.length === 1 ? (L + R) / 2 : L + 14 + (i * (R - L - 28)) / (series.length - 1))
  const y = (v: number) => B - (v / max) * (B - T)
  const pts = (k: 'income' | 'spending') => series.map((s, i) => `${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ')
  const bi = series.indexOf(biggest)
  const compact = (v: number) => privately(new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v))
  const mixMonths = series.slice(-6)
  const mixMax = Math.max(1, ...mixMonths.map((s) => s.spending))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={first ? `${day(first)} – ${day(last)} · ${inRange.length} transactions` : 'No transactions in this range'}
        title="Reports"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-400 print:hidden">
              Range
              <select className="field w-auto" value={range} onChange={(e) => setRange(e.target.value as Range)}>
                {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-secondary print:hidden" onClick={exportCsv} disabled={!inRange.length}><Download className="h-4 w-4" aria-hidden /> Export CSV</button>
            <button type="button" className="btn btn-primary print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Download PDF report</button>
          </>
        }
      />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: `Income ${range === 'year' ? 'this year' : 'in range'}`, value: formatMoney(income, currency), cls: 'text-good' },
          { label: `Spending ${range === 'year' ? 'this year' : 'in range'}`, value: formatMoney(spending, currency), cls: 'text-ink' },
          { label: 'Left over', value: formatMoney(income - spending, currency), cls: income - spending < 0 ? 'text-bad' : 'text-ink' },
          { label: 'Biggest month', value: biggest && biggest.spending ? `${monthName(biggest.m, 'short')} · ${formatMoney(biggest.spending, currency)}` : '—', cls: 'text-ink' },
        ].map((k) => (
          <div key={k.label} className="card flex flex-col gap-1 rounded-[14px] px-5 py-4">
            <span className="text-slate-400">{k.label}</span>
            <span className={`font-display text-[24px] leading-tight font-bold tabular-nums sm:text-[28px] ${k.cls}`}>{k.value}</span>
          </div>
        ))}
      </section>

      <section aria-labelledby="trend-heading" className="card flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trend-heading" className="card-title">Income vs spending, {monthName(months[0], 'short')} – {monthName(months.at(-1)!, 'short')}</h2>
          <div className="flex gap-4 text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-good" />Income</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-spend" />Spending</span>
          </div>
        </div>
        {withData.length === 0 ? (
          <p className="py-10 text-center text-slate-400">No transactions in this range.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="min-w-[640px]" role="img" aria-label={`Income and spending per month. Biggest spending month: ${monthName(biggest.m)} with ${formatMoney(biggest.spending, currency)}.`}>
            {[0, 1, 2, 3].map((i) => <line key={i} x1={L} x2={R} y1={T + ((B - T) / 4) * i} y2={T + ((B - T) / 4) * i} stroke="var(--color-track)" strokeWidth={1} />)}
            <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-line-strong)" strokeWidth={1} />
            {[4, 3, 2, 1].map((i) => <text key={i} x={L - 8} y={B - ((B - T) / 4) * i + 4} textAnchor="end" fontSize={12} fill="var(--chart-label)">{compact(step * i)}</text>)}
            <polyline points={pts('income')} fill="none" stroke="var(--color-good)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={pts('spending')} fill="none" stroke="var(--color-spend)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {biggest && biggest.spending > 0 && (
              <>
                <circle cx={x(bi)} cy={y(biggest.spending)} r={6} fill="var(--color-surface)" stroke="var(--color-spend)" strokeWidth={2} />
                <text x={bi > series.length / 2 ? x(bi) - 12 : x(bi) + 12} y={y(biggest.spending) - 10} textAnchor={bi > series.length / 2 ? 'end' : 'start'} fontSize={13} fontWeight={600} fill="var(--color-ink)">
                  {monthName(biggest.m, 'short')} {formatMoney(biggest.spending, currency)}
                  {biggestPayment ? ` · ${payeeName(biggestPayment)} ${formatMoney(biggestPayment.amount, currency)}` : ''}
                </text>
              </>
            )}
            {series.map((s, i) => <text key={s.m} x={x(i)} y={252} textAnchor="middle" fontSize={12} fill="var(--chart-label)">{monthName(s.m, 'short')}</text>)}
          </svg>
          </div>
        )}
      </section>

      <section aria-labelledby="mix-heading" className="card flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="mix-heading" className="card-title">Spending mix by month</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
            {CATEGORY_GROUPS.map((g) => <span key={g} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: groupColor(g) }} />{g}</span>)}
          </div>
        </div>
        <div className="grid h-[240px] items-end gap-3" style={{ gridTemplateColumns: `repeat(${mixMonths.length}, minmax(0, 1fr))` }}>
          {mixMonths.map((s) => (
            <div key={s.m} className="flex h-full flex-col items-center justify-end gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-slate-300">{s.spending ? compact(s.spending) : ''}</span>
              <div
                className="flex w-full max-w-[56px] flex-col-reverse gap-0.5 overflow-hidden rounded-t-lg"
                style={{ height: `${(s.spending / mixMax) * 200}px` }}
                role="img"
                aria-label={`${monthName(s.m)}: ${CATEGORY_GROUPS.map((g, i) => (s.groups[i] ? `${g} ${formatMoney(s.groups[i], currency)}` : '')).filter(Boolean).join(', ')}`}
              >
                {CATEGORY_GROUPS.map((g, i) => (s.groups[i] ? <div key={g} style={{ flex: s.groups[i], background: groupColor(g) }} /> : null))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 text-center text-xs text-slate-500" style={{ gridTemplateColumns: `repeat(${mixMonths.length}, minmax(0, 1fr))` }}>
          {mixMonths.map((s) => <span key={s.m}>{monthName(s.m, 'short')}{s.m === today.slice(0, 7) ? ` (to ${new Date().getDate()}th)` : ''}</span>)}
        </div>
        <p className="rounded-xl bg-subtle px-3.5 py-3 text-sm leading-normal text-slate-400">
          Bills = utilities, mobile, subscriptions, insurance, fees, taxes, loans. Lifestyle = travel, dining, shopping, fitness, personal care, education, entertainment. Other includes cash withdrawals and savings.
        </p>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section aria-labelledby="tp-heading" className="card flex flex-col gap-4 p-6 lg:col-span-2">
          <h2 id="tp-heading" className="card-title">Top payees {range === 'year' ? 'this year' : 'in range'}</h2>
          {payees.length === 0 && <p className="text-slate-400">No spending in this range.</p>}
          {payees.map(({ g, total }) => {
            const cat = g.tx[0]?.category ?? 'Other'
            const others = otherCount(g.tx)
            return (
              <div key={g.key} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink"><span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: categoryColor(cat) }} /><span className="truncate">{g.label}</span></span>
                  <span className="font-semibold tabular-nums text-ink">{formatMoney(total, currency)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (total / payees[0].total) * 100)}%`, background: categoryColor(cat) }} /></div>
                <span className="text-xs text-slate-500">
                  {g.tx.length} payment{g.tx.length === 1 ? '' : 's'} · {cat}
                  {others ? ` · ${others} in “Other”, worth sorting` : ''}
                </span>
              </div>
            )
          })}
        </section>

        <section aria-labelledby="tax-heading" className="card-tint flex flex-col gap-3 p-6">
          <span className="eyebrow">Tax return helper</span>
          <h2 id="tax-heading" className="card-title">Tax year {taxYear} — so far</h2>
          {taxLines.map((l) => (
            <div key={l.label} className="flex justify-between gap-3 border-b border-tintline py-1.5 last:border-0">
              <span className="text-slate-300">{l.label}</span>
              <b className="tabular-nums text-ink">{l.value ? formatMoney(l.value, currency) : '—'}</b>
            </div>
          ))}
          <Link to="/tax" className="font-semibold text-accent print:hidden">Open the tax page</Link>
        </section>
      </div>

      <Link to="/report/monthly" className="card flex items-center gap-3 p-5 hover:border-tintline print:hidden">
        <FileText className="h-5 w-5 text-accent" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold text-ink">Monthly report</span>
          <span className="block text-sm text-slate-400">One month or salary cycle in detail: figures, watch list, budgets, and a report you can save.</span>
        </span>
      </Link>
    </div>
  )
}
