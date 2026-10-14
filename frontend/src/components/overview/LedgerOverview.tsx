import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, ChevronLeft, ChevronRight, FileUp, Plus } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { usePeriodMode } from '../../hooks/usePeriodMode'
import { ConnectDrive } from '../ledger/ConnectDrive'
import { EmptyState } from '../EmptyState'
import { AccountList, CategoryBars, KpiTiles, RecentList, SectionHeader, TrendChart } from './OverviewParts'
import { BudgetCard } from './BudgetCard'
import { BudgetDialog } from './BudgetDialog'
import { budgetProgress } from '../../lib/ledger/budgets'
import { byAccount, currenciesByUse, inSpan, monthName, spendingByCategory, totalsFor, type Span, type TrendPoint } from '../../lib/ledger/summary'
import { buildPeriods, type Period, type PeriodMode } from '../../lib/ledger/periods'
import { todayIso, type Transaction } from '../../lib/ledger/types'

const spanOf = (p: Period): Span => ({ start: p.start, end: p.end })

const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** "27 Sep – 26 Oct": an open cycle runs to its expected end; the first partial one has no start salary. */
function cycleRange(p: Period): string {
  const end = p.open && p.expectedEnd ? p.expectedEnd : p.end
  return `${shortDay(p.start)} – ${shortDay(end)}`
}

const cycleShort = (p: Period) => shortDay(p.start)

/** The Overview's money section, computed in the browser from the Ledger in the user's Drive. */
export function LedgerOverview() {
  const { status, transactions, budgets } = useLedger()
  const navigate = useNavigate()
  const [mode, setMode] = usePeriodMode()
  const [picked, setPicked] = useState<{ mode: PeriodMode; key: string } | null>(null)
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null)
  const [editingBudgets, setEditingBudgets] = useState(false)

  const currencies = useMemo(() => currenciesByUse(transactions), [transactions])
  const currency = pickedCurrency && currencies.includes(pickedCurrency) ? pickedCurrency : currencies[0] ?? 'EUR'

  const today = todayIso()
  // Salary mode needs salary credits; without any, the Overview falls back to calendar months and says so
  const salaryPeriods = useMemo(() => (mode === 'salary' ? buildPeriods('salary', transactions, today) : []), [mode, transactions, today])
  const useSalary = mode === 'salary' && salaryPeriods.length > 0
  const fellBack = mode === 'salary' && !useSalary
  const periods = useMemo(
    () => (useSalary ? salaryPeriods : buildPeriods('calendar', transactions, today)),
    [useSalary, salaryPeriods, transactions, today],
  )
  const activeMode: PeriodMode = useSalary ? 'salary' : 'calendar'

  // Default: the latest period that has transactions (the current one, when it has any)
  const defaultKey = useMemo(() => {
    const withData = periods.filter((p) => transactions.some((t) => inSpan(t.date, spanOf(p))))
    return (withData.at(-1) ?? periods.at(-1))?.start ?? ''
  }, [periods, transactions])
  const selectedKey = picked && picked.mode === activeMode ? picked.key : defaultKey
  const index = Math.max(0, periods.findIndex((p) => p.start === selectedKey))
  const cur = periods[index]
  const prev = index > 0 ? periods[index - 1] : undefined
  const next = periods[index + 1]

  const data = useMemo(() => {
    if (!cur) return null
    const span = spanOf(cur)
    const prevSpan = prev ? spanOf(prev) : null
    const emptyTotals = { income: 0, spending: 0, net: 0, count: 0 }
    return {
      now: totalsFor(transactions, span, currency),
      before: prevSpan ? totalsFor(transactions, prevSpan, currency) : emptyTotals,
      categories: spendingByCategory(transactions, span, currency),
      // All categories of the previous period, so each row can be compared with it
      beforeCategories: prevSpan ? spendingByCategory(transactions, prevSpan, currency, 1000) : undefined,
      points: periods.slice(Math.max(0, index - 5), index + 1).map<TrendPoint>((p) => ({ month: p.start, ...totalsFor(transactions, spanOf(p), currency) })),
      budgetRows: budgetProgress(budgets, transactions, span, currency),
      accounts: byAccount(transactions, span, currency),
      recent: transactions
        .filter((t: Transaction) => inSpan(t.date, span))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    }
  }, [transactions, budgets, cur, prev, periods, index, currency])

  if (status !== 'ready') {
    return (
      <section className="card" aria-label="Connect Google Drive">
        <ConnectDrive context="transactions" />
      </section>
    )
  }

  if (!transactions.length) {
    return (
      <section className="card">
        <EmptyState
          icon={ArrowLeftRight}
          title="Your overview starts with your first transaction"
          description="Add one by hand or import your bank's CSV. Totals, spending by category and monthly trends then appear here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/transactions" className="btn btn-primary"><Plus className="h-4 w-4" /> Add transaction</Link>
              <Link to="/transactions" className="btn btn-secondary"><FileUp className="h-4 w-4" /> Import CSV</Link>
            </div>
          }
        />
      </section>
    )
  }

  if (!cur || !data) return null

  const pick = (p: Period | undefined) => {
    if (p) setPicked({ mode: activeMode, key: p.start })
  }
  const title = useSalary ? cycleRange(cur) : monthName(cur.start.slice(0, 7))
  const subtitle = useSalary
    ? cur.partial
      ? 'Before your first salary credit'
      : cur.open
        ? 'Salary cycle · so far'
        : 'Salary cycle'
    : null
  const noun = useSalary ? 'this cycle' : 'this month'
  const labelOf = (p: TrendPoint, style?: 'long' | 'short') => (useSalary ? cycleShort(periods.find((x) => x.start === p.month)!) : monthName(p.month.slice(0, 7), style))

  return (
    <div className="space-y-6">
      {/* Filters in one row above the charts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label="Period">
            <button type="button" className="icon-btn border border-line-strong" aria-label="Previous period" disabled={!prev} onClick={() => pick(prev)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-44 text-center" aria-live="polite">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </div>
            <button type="button" className="icon-btn border border-line-strong" aria-label="Next period" disabled={!next} onClick={() => pick(next)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div role="radiogroup" aria-label="Period type" className="flex gap-1 rounded-xl border border-line-strong p-1">
            {(['calendar', 'salary'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m)
                  setPicked(null)
                }}
                className={`min-h-9 rounded-lg px-3 text-sm font-medium ${mode === m ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {m === 'calendar' ? 'Calendar month' : 'Salary cycle'}
              </button>
            ))}
          </div>
        </div>
        {currencies.length > 1 && (
          <div role="radiogroup" aria-label="Currency" className="flex gap-1 rounded-xl border border-line-strong p-1">
            {currencies.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === currency} onClick={() => setPickedCurrency(c)} className={`min-h-9 rounded-lg px-3 text-sm font-medium ${c === currency ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      {fellBack && (
        <p className="text-sm text-amber-200/90">
          No salary credits found yet, so calendar months are shown. A salary is recognised from money in categorised as Salary.
        </p>
      )}

      <KpiTiles now={data.now} before={data.before} currency={currency} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="cat-heading" className="card">
          <SectionHeader id="cat-heading" title="Spending by category" to="/transactions" />
          <CategoryBars
            rows={data.categories}
            currency={currency}
            onPick={(c) => navigate(`/transactions?q=${encodeURIComponent(c)}`)}
            before={prev ? data.beforeCategories : undefined}
            noun={noun}
          />
          {prev && <p className="px-5 pb-4 text-xs text-slate-500 sm:px-6">Change vs {useSalary ? 'the previous cycle' : 'the previous month'}. Amber is more spending.</p>}
        </section>
        <section aria-labelledby="trend-heading" className="card">
          <SectionHeader id="trend-heading" title={useSalary ? 'Last 6 cycles' : 'Last 6 months'} />
          <TrendChart points={data.points} currency={currency} selected={cur.start} onSelect={(key) => pick(periods.find((p) => p.start === key))} labelOf={labelOf} />
        </section>
      </div>

      <section aria-labelledby="budget-heading" className="card">
        <SectionHeader id="budget-heading" title={useSalary ? 'Budgets this cycle' : 'Budgets this month'} />
        <BudgetCard
          rows={data.budgetRows}
          currency={currency}
          noun={noun}
          hasBudgets={budgets.some((b) => b.currency === currency)}
          onEdit={() => setEditingBudgets(true)}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-heading" className="card">
          <SectionHeader id="recent-heading" title="Recent activity" to="/transactions" />
          <RecentList items={data.recent} />
        </section>
        <section aria-labelledby="acc-heading" className="card">
          <SectionHeader id="acc-heading" title="By account" />
          <AccountList rows={data.accounts} currency={currency} />
        </section>
      </div>
      {editingBudgets && <BudgetDialog onClose={() => setEditingBudgets(false)} currency={currency} budgets={budgets} />}
      {currencies.length > 1 && <p className="text-center text-xs text-slate-500">Totals are shown per currency and never converted.</p>}
    </div>
  )
}
