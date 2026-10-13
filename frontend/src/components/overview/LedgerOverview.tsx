import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, ChevronLeft, ChevronRight, FileUp, Plus } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { ConnectDrive } from '../ledger/ConnectDrive'
import { EmptyState } from '../EmptyState'
import { AccountList, CategoryBars, KpiTiles, RecentList, SectionHeader, TrendChart } from './OverviewParts'
import { byAccount, currenciesByUse, currentMonth, defaultMonth, monthName, shiftMonth, spendingByCategory, totalsFor, trend, ym } from '../../lib/ledger/summary'

/** The Overview's money section, computed in the browser from the Ledger in the user's Drive. */
export function LedgerOverview() {
  const { status, transactions } = useLedger()
  const navigate = useNavigate()
  const [pickedMonth, setPickedMonth] = useState<string | null>(null)
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null)

  const currencies = useMemo(() => currenciesByUse(transactions), [transactions])
  const currency = pickedCurrency && currencies.includes(pickedCurrency) ? pickedCurrency : currencies[0] ?? 'EUR'
  const month = pickedMonth ?? defaultMonth(transactions)

  const data = useMemo(() => {
    const now = totalsFor(transactions, month, currency)
    const before = totalsFor(transactions, shiftMonth(month, -1), currency)
    return {
      now,
      before,
      categories: spendingByCategory(transactions, month, currency),
      points: trend(transactions, month, currency, 6),
      accounts: byAccount(transactions, month, currency),
      recent: transactions
        .filter((t) => ym(t.date) === month)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    }
  }, [transactions, month, currency])

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

  const isFuture = month >= currentMonth()

  return (
    <div className="space-y-6">
      {/* Filters in one row above the charts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Month">
          <button type="button" className="icon-btn border border-line-strong" aria-label="Previous month" onClick={() => setPickedMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-40 text-center text-lg font-semibold text-white" aria-live="polite">{monthName(month)}</h2>
          <button type="button" className="icon-btn border border-line-strong" aria-label="Next month" disabled={isFuture} onClick={() => setPickedMonth(shiftMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </button>
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

      <KpiTiles now={data.now} before={data.before} currency={currency} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="cat-heading" className="card">
          <SectionHeader id="cat-heading" title="Spending by category" to="/transactions" />
          <CategoryBars rows={data.categories} currency={currency} onPick={(c) => navigate(`/transactions?q=${encodeURIComponent(c)}`)} />
        </section>
        <section aria-labelledby="trend-heading" className="card">
          <SectionHeader id="trend-heading" title="Last 6 months" />
          <TrendChart points={data.points} currency={currency} selected={month} onSelect={setPickedMonth} />
        </section>
      </div>

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
      {currencies.length > 1 && <p className="text-center text-xs text-slate-500">Totals are shown per currency and never converted.</p>}
    </div>
  )
}
