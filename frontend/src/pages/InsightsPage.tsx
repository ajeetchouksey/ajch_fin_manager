import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, Repeat, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { SectionHeader } from '../components/overview/OverviewParts'
import { ForecastChart } from '../components/insights/ForecastChart'
import { useLedger } from '../context/LedgerContext'
import { useReview } from '../hooks/useReview'
import { formatMoney } from '../lib/ledger/types'
import { monthName } from '../lib/ledger/summary'
import type { Area, Gap, Severity } from '../lib/analysis/engine'

const SEVERITY: Record<Severity, { label: string; tone: string; icon: typeof Info }> = {
  high: { label: 'Act now', tone: 'text-red-300 bg-red-400/10', icon: AlertTriangle },
  medium: { label: 'Important', tone: 'text-amber-200 bg-amber-300/10', icon: AlertTriangle },
  low: { label: 'Worth a look', tone: 'text-slate-200 bg-white/5', icon: Lightbulb },
  info: { label: 'Tip', tone: 'text-slate-300 bg-white/5', icon: Info },
}

/** Where to fix each kind of gap. */
const AREA_LINK: Partial<Record<Area, { to: string; label: string }>> = {
  Data: { to: '/accounts', label: 'Open Accounts' },
  'Safety net': { to: '/accounts', label: 'Open Accounts' },
  Debt: { to: '/accounts', label: 'Open Accounts' },
  Retirement: { to: '/accounts', label: 'Add pension' },
  Protection: { to: '/accounts', label: 'Add policy' },
  Goals: { to: '/goals', label: 'Open Goals' },
  Spending: { to: '/transactions', label: 'Open Transactions' },
  'Cash flow': { to: '/transactions', label: 'Open Transactions' },
}

function scoreWord(score: number) {
  if (score >= 80) return 'Strong'
  if (score >= 60) return 'Good, with gaps'
  if (score >= 40) return 'Needs work'
  return 'Needs attention'
}

function ScoreRing({ score }: { score: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={`Financial health ${score} out of 100`}>
      <circle cx={42} cy={42} r={r} fill="none" stroke="rgb(148 163 184 / 0.18)" strokeWidth={8} />
      <circle cx={42} cy={42} r={r} fill="none" stroke="var(--color-brand-soft)" strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x={42} y={48} textAnchor="middle" fontSize={22} fontWeight={600} fill="white">{score}</text>
    </svg>
  )
}

function GapCard({ gap }: { gap: Gap }) {
  const s = SEVERITY[gap.severity]
  const Icon = s.icon
  const link = AREA_LINK[gap.area]
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.tone}`}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{gap.area} · {s.label}</p>
          <h3 className="mt-0.5 font-semibold text-white">{gap.title}</h3>
          <p className="mt-1 text-sm text-slate-300">{gap.detail}</p>
          <p className="mt-2 text-sm text-slate-200"><span className="font-medium text-brand-soft">Next step:</span> {gap.action}</p>
          {link && <Link to={link.to} className="mt-2 inline-block text-sm font-medium text-brand-soft hover:text-white">{link.label} →</Link>}
        </div>
      </div>
    </li>
  )
}

/** The full review: health score, gaps with next steps, forecast and recurring payments. Computed on this device. */
export function InsightsPage() {
  const { status } = useLedger()
  const { review } = useReview()
  const [showAll, setShowAll] = useState(false)
  const cur = review.currency
  const cf = review.cashFlow
  const nw = review.netWorth
  const essential = cf.avgEssential || cf.avgSpending * 0.7
  const surplus = cf.avgIncome - cf.avgSpending
  const visibleGaps = showAll ? review.gaps : review.gaps.slice(0, 6)
  const recurringOut = review.recurring.filter((r) => r.direction === 'out' && !r.lapsed)

  if (status !== 'ready') {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Insights" description="A full review of your money: gaps, next steps and where you are heading." />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Insights" description="A full review of your money: gaps, next steps and where you are heading." />
      <p className="-mt-4 mb-5 flex items-center gap-1.5 text-xs text-slate-500 sm:-mt-6">
        <ShieldCheck className="h-3.5 w-3.5" /> Worked out on this device from your Ledger. General guidance, not personal financial advice.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card flex items-center gap-4 px-5 py-4">
            {review.score !== null ? <ScoreRing score={review.score} /> : <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-8 border-white/10 text-slate-500">–</span>}
            <div>
              <p className="text-sm font-medium text-slate-400">Financial health</p>
              <p className="text-lg font-semibold text-white">{review.score !== null ? scoreWord(review.score) : 'Not enough data'}</p>
            </div>
          </div>
          <div className="card px-5 py-4">
            <p className="text-sm font-medium text-slate-400">Net worth</p>
            <p className="mt-1 font-display text-[28px] leading-tight font-semibold tabular-nums text-white">{formatMoney(nw.netWorth, cur)}</p>
            <p className="text-xs text-slate-400">{formatMoney(nw.liabilities, cur)} owed</p>
          </div>
          <div className="card px-5 py-4">
            <p className="text-sm font-medium text-slate-400">Savings rate</p>
            <p className={`mt-1 font-display text-[28px] leading-tight font-semibold tabular-nums ${cf.savingsRate !== null && cf.savingsRate < 0 ? 'text-amber-200' : 'text-white'}`}>
              {cf.savingsRate !== null ? `${Math.round(cf.savingsRate * 100)}%` : '–'}
            </p>
            <p className="text-xs text-slate-400">{cf.months.length ? `${formatMoney(surplus, cur)} left a month (avg of ${cf.months.length})` : 'Needs a complete month'}</p>
          </div>
          <div className="card px-5 py-4">
            <p className="text-sm font-medium text-slate-400">Emergency fund</p>
            <p className="mt-1 font-display text-[28px] leading-tight font-semibold tabular-nums text-white">{essential > 0 ? `${(nw.liquid / essential).toFixed(1)} mo` : '–'}</p>
            <p className="text-xs text-slate-400">{formatMoney(nw.liquid, cur)} in reach</p>
          </div>
        </div>

        <section className="card overflow-hidden p-0" aria-labelledby="gaps-heading">
          <SectionHeader id="gaps-heading" title={review.gaps.length ? `Gaps and next steps (${review.gaps.length})` : 'Gaps and next steps'} />
          {review.gaps.length ? (
            <>
              <ul className="divide-y divide-line">{visibleGaps.map((g) => <GapCard key={g.id} gap={g} />)}</ul>
              {review.gaps.length > 6 && (
                <button type="button" className="w-full border-t border-line py-3 text-sm font-medium text-brand-soft hover:text-white" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `Show all ${review.gaps.length}`}
                </button>
              )}
            </>
          ) : (
            <p className="flex items-center gap-2 px-6 py-6 text-slate-300"><CheckCircle2 className="h-5 w-5 text-brand-success" /> No gaps found. Keep your balances up to date and check back monthly.</p>
          )}
        </section>

        <section className="card overflow-hidden p-0" aria-labelledby="fc-heading">
          <SectionHeader id="fc-heading" title="Next 12 months" />
          <ForecastChart points={review.forecast.points} currency={cur} start={{ liquid: nw.liquid, netWorth: nw.netWorth }} />
          {review.forecast.cashRunsOutMonth && (
            <p className="mx-5 mb-3 rounded-lg bg-amber-300/10 px-3 py-2 text-sm text-amber-100 sm:mx-6">
              In a bad stretch, cash could run out around {monthName(review.forecast.cashRunsOutMonth)}.
            </p>
          )}
          <ul className="list-disc space-y-1 px-10 pb-5 text-xs text-slate-400 sm:px-11">
            {review.forecast.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card overflow-hidden p-0" aria-labelledby="rec-heading">
            <SectionHeader id="rec-heading" title="Regular payments" to="/transactions" />
            {recurringOut.length ? (
              <ul className="divide-y divide-line">
                {recurringOut.slice(0, 10).map((r) => (
                  <li key={r.key} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <Repeat className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{r.name}</span>
                      <span className="block text-xs text-slate-400">{r.category} · {r.cadence} · next around {r.nextDate}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-white">{formatMoney(r.monthly, cur)}<span className="text-xs text-slate-500">/mo</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-6 text-sm text-slate-400">Regular payments show up after about three months of transactions.</p>
            )}
          </section>

          <section className="card overflow-hidden p-0" aria-labelledby="cat-heading2">
            <SectionHeader id="cat-heading2" title="Where money goes (monthly)" />
            {cf.byCategory.length ? (
              <ul className="divide-y divide-line">
                {cf.byCategory.slice(0, 10).map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
                    <span className="text-slate-200">{c.category}{c.essential && <span className="ml-2 text-xs text-slate-500">essential</span>}</span>
                    <span className="tabular-nums text-white">{formatMoney(c.monthly, cur)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-6 text-sm text-slate-400">Import a complete month of transactions to see this.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
