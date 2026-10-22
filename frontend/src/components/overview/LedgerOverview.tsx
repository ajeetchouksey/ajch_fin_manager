import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, FileUp, Plus } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { usePeriodMode } from '../../hooks/usePeriodMode'
import { ConnectDrive } from '../ledger/ConnectDrive'
import { EmptyState } from '../EmptyState'
import { PageHeader } from '../PageHeader'
import { ADD_TRANSACTION_PATH, IMPORT_PATH } from '../navigation'
import { KpiRow, type Kpi } from './KpiRow'
import { CashFlowCard, type FlowPoint } from './CashFlowCard'
import { WhereItWent } from './WhereItWent'
import { RecentTable, payeeName } from './RecentTable'
import { RegularPayments } from './RegularPayments'
import { WorthChecking } from './WorthChecking'
import { PhoneOverview } from './PhoneOverview'
import { useAuth } from '../../hooks/useAuth'
import { recurring } from '../../lib/analysis/engine'
import { accountBalances } from '../../lib/ledger/balances'
import { isTransfer } from '../../lib/ledger/categorize'
import { change, currenciesByUse, inSpan, monthName, spendingByCategory, totalsFor, type Span } from '../../lib/ledger/summary'
import { buildPeriods, type Period, type PeriodMode } from '../../lib/ledger/periods'
import { formatMoney, todayIso, INCOME_CATEGORIES } from '../../lib/ledger/types'

const spanOf = (p: Period): Span => ({ start: p.start, end: p.end })
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * Overview (design: Main): header with period switch and Add, key figures, salary-cycle note,
 * cash flow, where it went, recent transactions, worth checking, regular payments, goals prompt.
 * Everything is computed in the browser from the Ledger in the user's Drive.
 */
export function LedgerOverview({ intro }: { intro?: ReactNode }) {
  const { status, transactions, accounts, balances, goals } = useLedger()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [mode, setMode] = usePeriodMode()
  const [picked, setPicked] = useState<{ mode: PeriodMode; key: string } | null>(null)
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null)

  const currencies = useMemo(() => currenciesByUse(transactions), [transactions])
  const currency = pickedCurrency && currencies.includes(pickedCurrency) ? pickedCurrency : currencies[0] ?? 'EUR'
  const today = todayIso()

  // Salary mode needs salary credits; without any, calendar months are shown and the page says so
  const salaryPeriods = useMemo(() => (mode === 'salary' ? buildPeriods('salary', transactions, today) : []), [mode, transactions, today])
  const useSalary = mode === 'salary' && salaryPeriods.length > 0
  const fellBack = mode === 'salary' && !useSalary
  const periods = useMemo(() => (useSalary ? salaryPeriods : buildPeriods('calendar', transactions, today)), [useSalary, salaryPeriods, transactions, today])
  const activeMode: PeriodMode = useSalary ? 'salary' : 'calendar'

  const defaultKey = useMemo(() => {
    const withData = periods.filter((p) => transactions.some((t) => inSpan(t.date, spanOf(p))))
    return (withData.at(-1) ?? periods.at(-1))?.start ?? ''
  }, [periods, transactions])
  const selectedKey = picked && picked.mode === activeMode ? picked.key : defaultKey
  const index = Math.max(0, periods.findIndex((p) => p.start === selectedKey))
  const cur = periods[index]
  const prev = index > 0 ? periods[index - 1] : undefined
  const next = periods[index + 1]
  const pick = (p: Period | undefined) => p && setPicked({ mode: activeMode, key: p.start })
  const labelOf = (p: Period, style: 'long' | 'short' = 'short') => (useSalary ? `from ${shortDay(p.start)}` : monthName(p.start.slice(0, 7), style))

  const data = useMemo(() => {
    if (!cur) return null
    const span = spanOf(cur)
    const now = totalsFor(transactions, span, currency)
    const before = prev ? totalsFor(transactions, spanOf(prev), currency) : null
    const window = periods.slice(Math.max(0, index - 5), index + 1)
    const points: FlowPoint[] = window.map((p) => ({ key: p.start, label: labelOf(p), ...totalsFor(transactions, spanOf(p), currency) }))
    // The note under the chart: the biggest-spending period and its largest single payment
    const big = [...points].sort((a, b) => b.spending - a.spending)[0]
    const bigPeriod = window.find((p) => p.start === big?.key)
    const largest = bigPeriod
      ? transactions
          .filter((t) => t.direction === 'out' && !isTransfer(t) && t.currency === currency && inSpan(t.date, spanOf(bigPeriod)))
          .sort((a, b) => b.amount - a.amount)[0]
      : undefined
    const inSpanTx = transactions.filter((t) => inSpan(t.date, span) && t.currency === currency)
    const incomeCats = Array.from(
      inSpanTx
        .filter((t) => t.direction === 'in' && !isTransfer(t))
        .reduce((m, t) => m.set(t.category, (m.get(t.category) ?? 0) + t.amount), new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
    return {
      now,
      before,
      points,
      flowNote:
        big && big.spending > 0 && points.length > 1 && largest
          ? `${big.label} was the biggest ${useSalary ? 'cycle' : 'month'}: ${formatMoney(big.spending, currency)}, including one ${payeeName(largest)} payment of ${formatMoney(largest.amount, currency)}.`
          : undefined,
      categories: spendingByCategory(transactions, span, currency, 10),
      incomeCats,
      recent: [...inSpanTx].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    }
    // labelOf only depends on useSalary, which is in the list through periods
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, cur, prev, periods, index, currency])

  const bills = useMemo(
    () =>
      recurring(transactions, currency, today)
        .filter((r) => r.direction === 'out' && !r.lapsed && !INCOME_CATEGORIES.includes(r.category) && r.category !== 'Transfer')
        .sort((a, b) => b.monthly - a.monthly)
        .slice(0, 5),
    [transactions, currency, today],
  )
  const bal = useMemo(() => accountBalances(accounts, currency, balances, transactions, today), [accounts, currency, balances, transactions, today])
  const lastEntry = useMemo(() => transactions.reduce((m, t) => (t.date > m ? t.date : m), ''), [transactions])

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Overview" />
        {intro}
        <section className="card" aria-label="Connect Google Drive">
          <ConnectDrive context="transactions" />
        </section>
      </>
    )
  }

  if (!transactions.length || !cur || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        {intro}
        <section className="card">
          <EmptyState
            icon={ArrowLeftRight}
            title="Your overview starts with your first transaction"
            description="Add one by hand or import your bank's CSV. Totals, spending by category and monthly trends then appear here."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to={ADD_TRANSACTION_PATH} className="btn btn-primary"><Plus className="h-4 w-4" /> Add transaction</Link>
                <Link to={IMPORT_PATH} className="btn btn-secondary"><FileUp className="h-4 w-4" /> Import CSV</Link>
              </div>
            }
          />
        </section>
      </>
    )
  }

  const noun = useSalary ? 'cycle' : 'month'
  const title = useSalary ? 'Salary cycle overview' : `${monthName(cur.start.slice(0, 7)).split(' ')[0]} overview`
  const spendChange = data.before ? change(data.now.spending, data.before.spending) : null
  const left = data.now.income - data.now.spending
  const kept = data.now.income > 0 ? left / data.now.income : null
  const kpis: Kpi[] = [
    {
      label: useSalary ? 'Income this cycle' : 'Income',
      value: formatMoney(data.now.income, currency),
      tone: 'good',
      note: data.incomeCats.slice(0, 3).join(', ') || 'No income yet',
    },
    {
      label: useSalary ? 'Spending this cycle' : 'Spending',
      value: formatMoney(data.now.spending, currency),
      note: spendChange === null ? 'No earlier period to compare' : `${spendChange > 0 ? '▲' : '▼'} ${Math.abs(Math.round(spendChange * 100))}% vs ${prev ? (useSalary ? 'previous cycle' : monthName(prev.start.slice(0, 7)).split(' ')[0]) : ''}`,
      noteTone: spendChange === null ? 'muted' : spendChange > 0 ? 'bad' : 'good',
    },
    {
      label: useSalary && cur.open ? 'Left over so far' : 'Left over',
      value: formatMoney(left, currency),
      note: kept === null ? '' : kept >= 0 ? `${Math.round(kept * 100)}% of income kept` : 'More went out than came in',
      noteTone: kept !== null && kept < 0 ? 'bad' : 'muted',
    },
  ]
  const counted = bal.rows.filter((r) => r.counted)
  const asOf = counted.reduce((m, r) => (r.asOf > m ? r.asOf : m), '')
  const hero = counted.length
    ? { label: counted.length === 1 ? `${counted[0].name} balance` : 'Total balance', value: formatMoney(bal.net, currency), note: asOf ? `as of ${shortDay(asOf)}` : undefined }
    : { label: 'Your accounts', value: '—', note: <Link to="/accounts" className="underline">Add an account</Link> }

  const firstName = user?.name?.split(' ')[0]
  return (
    <>
    <PhoneOverview
      firstName={firstName}
      title={useSalary ? `Cycle from ${shortDay(cur.start)}` : monthName(cur.start.slice(0, 7)).split(' ')[0]}
      short={useSalary ? 'cycle' : monthName(cur.start.slice(0, 7), 'short')}
      onPrev={prev ? () => pick(prev) : undefined}
      onNext={next ? () => pick(next) : undefined}
      hero={hero}
      income={data.now.income}
      spending={data.now.spending}
      currency={currency}
      categories={data.categories}
      recent={data.recent}
      intro={intro}
      after={
        <>
          {fellBack && (
            <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-warn-text">
              No salary found yet, so calendar months are shown.
            </p>
          )}
          <WorthChecking />
          <Link to="/report" className="btn btn-secondary">Cash flow and reports</Link>
        </>
      }
    />
    <div className="hidden flex-col gap-6 md:flex">
      <PageHeader
        eyebrow={`From your ledger${lastEntry ? ` · last entry ${shortDay(lastEntry)}` : ''}`}
        title={
          <span className="flex items-center gap-2">
            {title}
            <span className="flex items-center gap-1 font-sans text-base font-normal">
              <button type="button" className="icon-btn" aria-label={`Previous ${noun}`} disabled={!prev} onClick={() => pick(prev)}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" className="icon-btn" aria-label={`Next ${noun}`} disabled={!next} onClick={() => pick(next)}>
                <ChevronRight className="h-5 w-5" />
              </button>
            </span>
          </span>
        }
        actions={
          <>
            {currencies.length > 1 && (
              <div className="seg" role="radiogroup" aria-label="Currency">
                {currencies.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={c === currency} onClick={() => setPickedCurrency(c)}>{c}</button>
                ))}
              </div>
            )}
            <div className="seg" role="group" aria-label="Period">
              {(['calendar', 'salary'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {m === 'calendar' ? 'Calendar month' : 'Salary cycle'}
                </button>
              ))}
            </div>
            <Link to={ADD_TRANSACTION_PATH} className="btn btn-primary"><Plus className="h-4 w-4" strokeWidth={2.4} /> Add transaction</Link>
          </>
        }
      />

      {intro}

      <KpiRow hero={hero} items={kpis} />

      {useSalary && (
        <section aria-label="Salary cycle" className="card-tint flex flex-wrap items-center gap-3 rounded-[14px] px-5 py-3.5">
          <Check className="h-5 w-5 text-accent" strokeWidth={2.2} aria-hidden />
          <span className="leading-normal text-slate-300">
            <b className="text-ink">Salary found.</b> Cycles run from one salary to the day before the next
            {cur.open ? ` — the current one started ${shortDay(cur.start)}${cur.expectedEnd ? ` and should end around ${shortDay(cur.expectedEnd)}` : ''}.` : '.'}
          </span>
        </section>
      )}
      {fellBack && (
        <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-warn-text">
          No salary found yet, so calendar months are shown. A salary is money in with the category Salary.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <CashFlowCard
          title={useSalary ? 'Cash flow by salary cycle' : 'Cash flow, last 6 months'}
          points={data.points}
          currency={currency}
          selected={cur.start}
          onSelect={(key) => pick(periods.find((p) => p.start === key))}
          note={data.flowNote}
        />
        <WhereItWent rows={data.categories} currency={currency} onPick={(c) => navigate(`/transactions?q=${encodeURIComponent(c)}`)} />
        <RecentTable items={data.recent} />
        <div className="flex min-w-0 flex-col gap-4">
          <WorthChecking />
          <RegularPayments items={bills} currency={currency} />
        </div>
      </div>

      {goals.length === 0 && (
        <section aria-labelledby="gl-heading" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-line-strong bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h2 id="gl-heading" className="card-title">No savings goals yet</h2>
            <span className="text-slate-400">
              {counted.length ? `Give your ${formatMoney(bal.net, currency)} a purpose: an emergency fund, a trip, education.` : 'An emergency fund, a trip, education: set one up and see when you get there.'}
            </span>
          </div>
          <Link to="/goals" className="btn btn-primary">Create a goal</Link>
        </section>
      )}
    </div>
    </>
  )
}
