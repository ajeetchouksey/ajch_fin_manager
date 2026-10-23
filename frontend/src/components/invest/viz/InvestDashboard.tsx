import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLedger } from '../../../context/LedgerContext'
import { cleanInvestorProfile } from '../../../lib/ledger/investor'
import { investTotals, worthSeries } from '../../../lib/ledger/investViz'
import { buildReview } from '../../../lib/ledger/review'
import { formatMoney, todayIso } from '../../../lib/ledger/types'
import { GainBars, PutInBars } from './Bars'
import { GoalBands } from './GoalBands'
import { pct } from './shared'
import { SpreadViz } from './SpreadViz'
import { WorthChart } from './WorthChart'

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-mono text-xl font-semibold tabular-nums text-ink sm:text-2xl">{value}</span>
      {sub && <span className={`text-sm tabular-nums ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-slate-400'}`}>{sub}</span>}
    </div>
  )
}

/** The Invest overview: numbers first, then charts. All figures come from the same code as the adviser pack. */
export function InvestDashboard() {
  const { accounts, balances, transactions, goals, plans, holdings, trades, profile } = useLedger()
  const today = todayIso()
  const investor = useMemo(() => cleanInvestorProfile(profile?.investorProfile), [profile])
  const review = useMemo(
    () => buildReview({ accounts, balances, transactions, goals, plans, holdings, trades, investor, householdMembers: profile?.householdMembers, today }),
    [accounts, balances, transactions, goals, plans, holdings, trades, investor, profile, today],
  )
  const totals = useMemo(() => investTotals(review.accounts, plans, today), [review.accounts, plans, today])
  const [picked, setPicked] = useState<string | null>(null)
  const currency = totals.find((t) => t.currency === picked)?.currency ?? totals[0]?.currency
  const t = totals.find((x) => x.currency === currency)
  const series = useMemo(() => (currency ? worthSeries(accounts, balances, currency, today) : null), [accounts, balances, currency, today])
  const alloc = review.allocation.find((a) => a.currency === currency)

  if (!t || !currency) {
    return (
      <section className="card flex flex-col gap-2 p-6">
        <h2 className="card-title">Nothing to show yet</h2>
        <p className="text-slate-400">
          Add an investment or retirement account and the charts appear here. <Link to="/accounts" className="font-semibold text-accent">Add one in Accounts</Link>
        </p>
      </section>
    )
  }

  const attention = [...review.warnings, ...review.drift].slice(0, 3)

  return (
    <div className="flex flex-col gap-4">
      {totals.length > 1 && (
        <div role="group" aria-label="Currency" className="flex gap-2 print:hidden">
          {totals.map((x) => (
            <button key={x.currency} type="button" aria-pressed={x.currency === currency} className={`btn ${x.currency === currency ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPicked(x.currency)}>
              {x.currency}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Worth now" value={formatMoney(t.worth, currency)} />
        <Tile label="Put in" value={formatMoney(t.putIn, currency)} />
        <Tile
          label="Gain beyond what you put in"
          value={`${t.change >= 0 ? '+' : ''}${formatMoney(t.change, currency)}`}
          sub={t.changeShare !== null ? `${t.change >= 0 ? '+' : ''}${pct(t.changeShare)}` : undefined}
          tone={t.change >= 0 ? 'good' : 'bad'}
        />
        <Tile label="Planned each month" value={formatMoney(t.planned, currency)} sub={t.planned ? undefined : 'No plan running'} />
      </div>

      {attention.length > 0 && (
        <div role="note" className="card-tint flex flex-col gap-2 p-5">
          <h2 className="card-title">Worth a look</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-300">{attention.map((a) => <li key={a}>{a}</li>)}</ul>
          <Link to="/invest/review" className="text-sm font-semibold text-accent">See everything in the adviser pack</Link>
        </div>
      )}

      {series && <WorthChart series={series} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {alloc && <SpreadViz allocation={alloc} drift={review.drift} />}
        <PutInBars rows={review.accounts} currency={currency} />
      </div>

      <GoalBands scenarios={review.goals.filter((g) => g.currency.toUpperCase() === currency)} />

      <GainBars holdings={review.holdings.filter((h) => h.currency.toUpperCase() === currency)} />

      <p className="text-sm text-slate-400">Illustrations, not forecasts. Fees, tax and inflation are not included. General information, not advice.</p>
    </div>
  )
}
