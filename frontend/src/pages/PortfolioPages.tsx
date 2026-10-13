import { useState } from 'react'
import { Plus, Target, Wallet } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { AccountDialog } from '../components/portfolio/AccountDialog'
import { GoalDialog } from '../components/portfolio/GoalDialog'
import { ErrorNote } from '../components/ledger/ui'
import { useLedger } from '../context/LedgerContext'
import { useReview } from '../hooks/useReview'
import { GROUP_LABELS, accountType, type Account, type AccountGroup, type Goal } from '../lib/ledger/portfolio'
import { formatMoney } from '../lib/ledger/types'
import { monthName } from '../lib/ledger/summary'
import type { GoalStatus } from '../lib/analysis/engine'

const GROUP_ORDER: AccountGroup[] = ['cash', 'investments', 'retirement', 'property', 'debt', 'cover']

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className={`mt-1 font-display text-[28px] leading-tight font-semibold tabular-nums ${tone === 'bad' ? 'text-amber-200' : 'text-white'}`}>{value}</p>
    </div>
  )
}

export function AccountsPage() {
  const { status, accounts, error } = useLedger()
  const { review } = useReview()
  const [open, setOpen] = useState<{ existing?: Account; type?: string } | null>(null)
  const nw = review.netWorth
  const cur = nw.currency

  const actions =
    status === 'ready' ? (
      <button type="button" className="btn btn-primary" onClick={() => setOpen({})}>
        <Plus className="h-4 w-4" /> Add account
      </button>
    ) : undefined

  return (
    <>
      <PageHeader eyebrow="Finance" title="Accounts" description="What you own, owe and are insured for. Kept in your Ledger." actions={actions} />
      {status !== 'ready' ? (
        <div className="card"><ConnectDrive context="transactions" /></div>
      ) : !accounts.length ? (
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add your current and savings accounts, investments, pension, loans and insurance with today’s balance. That unlocks net worth, the emergency-fund check and your forecast."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setOpen({ type: 'current' })}><Plus className="h-4 w-4" /> Bank account</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ type: 'brokerage' })}>Investment</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ type: 'loan' })}>Loan</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ type: 'ins_liability' })}>Insurance</button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Net worth" value={formatMoney(nw.netWorth, cur)} tone={nw.netWorth < 0 ? 'bad' : undefined} />
            <Stat label="You own" value={formatMoney(nw.assets, cur)} />
            <Stat label="You owe" value={formatMoney(nw.liabilities, cur)} />
          </div>
          {nw.otherCurrencies.length > 0 && (
            <p className="text-sm text-slate-400">
              Totals are in {cur}. {nw.otherCurrencies.map((o) => `${o.count} in ${o.currency}`).join(', ')} {nw.otherCurrencies.reduce((a, o) => a + o.count, 0) === 1 ? 'is' : 'are'} listed below but not added in, because no exchange rate is assumed.
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>
          {GROUP_ORDER.map((g) => {
            const list = accounts.filter((a) => accountType(a.type).group === g)
            if (!list.length) return null
            const total = list.filter((a) => a.currency === cur).reduce((s, a) => s + a.balance, 0)
            return (
              <section key={g} className="card overflow-hidden p-0" aria-labelledby={`grp-${g}`}>
                <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                  <h2 id={`grp-${g}`} className="font-semibold text-white">{GROUP_LABELS[g]}</h2>
                  {g !== 'cover' && <span className="text-sm tabular-nums text-slate-400">{formatMoney(total, cur)}</span>}
                </header>
                <ul className="divide-y divide-line">
                  {list.map((a) => {
                    const t = accountType(a.type)
                    const stale = a.asOf && Date.now() - Date.parse(a.asOf) > 60 * 86_400_000
                    return (
                      <li key={a.id}>
                        <button type="button" onClick={() => setOpen({ existing: a })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] sm:px-5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-white">{a.name}</span>
                            <span className="block truncate text-xs text-slate-400">
                              {t.label}
                              {a.institution ? ` · ${a.institution}` : ''}
                              {a.monthly ? ` · ${formatMoney(a.monthly, a.currency)}/month` : ''}
                              {g !== 'cover' && a.asOf ? ` · as of ${a.asOf}` : ''}
                              {stale && <span className="text-amber-200"> · update balance</span>}
                            </span>
                          </span>
                          {(g !== 'cover' || a.balance > 0) && (
                            <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${g === 'debt' ? 'text-amber-200' : 'text-white'}`}>
                              {g === 'debt' ? '−' : ''}{formatMoney(a.balance, a.currency)}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {open && <AccountDialog existing={open.existing} initialType={open.type} onClose={() => setOpen(null)} />}
    </>
  )
}

const STATUS_TEXT: Record<GoalStatus['status'], { label: string; tone: string }> = {
  done: { label: 'Reached', tone: 'bg-brand-success/15 text-brand-success' },
  'on-track': { label: 'On track', tone: 'bg-brand-success/15 text-brand-success' },
  behind: { label: 'Behind', tone: 'bg-amber-300/15 text-amber-200' },
  'no-plan': { label: 'No monthly plan', tone: 'bg-white/5 text-slate-300' },
  'no-date': { label: 'No date', tone: 'bg-white/5 text-slate-300' },
}

export function GoalsPage() {
  const { status, goals, error } = useLedger()
  const { review } = useReview()
  const [open, setOpen] = useState<{ existing?: Goal; name?: string } | null>(null)
  // Goals in other currencies are listed without projections
  const byId = new Map(review.goals.map((g) => [g.goal.id, g]))

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Goals"
        description="What you are saving for, and whether you will get there."
        actions={status === 'ready' ? <button type="button" className="btn btn-primary" onClick={() => setOpen({})}><Plus className="h-4 w-4" /> Add goal</button> : undefined}
      />
      {status !== 'ready' ? (
        <div className="card"><ConnectDrive context="transactions" /></div>
      ) : !goals.length ? (
        <div className="card">
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="An amount and a date is all it needs. You will see what to save each month and when you will get there."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {['Emergency fund', 'Holiday', 'Home deposit', 'New car'].map((n, i) => (
                  <button key={n} type="button" className={`btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOpen({ name: n })}>{n}</button>
                ))}
              </div>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <ErrorNote>{error}</ErrorNote>
          {goals.map((goal) => {
            const s = byId.get(goal.id)
            const saved = s?.saved ?? goal.saved
            const progress = s?.progress ?? (goal.target ? Math.min(1, saved / goal.target) : 0)
            const st = s ? STATUS_TEXT[s.status] : null
            return (
              <button key={goal.id} type="button" onClick={() => setOpen({ existing: goal })} className="card block p-5 text-left hover:border-brand-soft/40">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">{goal.name}</h2>
                  {st && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>}
                </div>
                <p className="mt-1 text-sm tabular-nums text-slate-300">
                  {formatMoney(saved, goal.currency)} of {formatMoney(goal.target, goal.currency)}
                  {goal.targetDate && <span className="text-slate-400"> · by {monthName(goal.targetDate.slice(0, 7))}</span>}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`${goal.name} progress`}>
                  <div className="h-full rounded-full bg-brand-soft" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {s?.status === 'done'
                    ? 'Target reached.'
                    : s?.projectedMonth
                      ? `At ${formatMoney(goal.monthly, goal.currency)} a month: reached in ${monthName(s.projectedMonth)}.`
                      : s?.requiredMonthly
                        ? `Save about ${formatMoney(Math.ceil(s.requiredMonthly), goal.currency)} a month to make it.`
                        : 'Add a monthly amount to see when you get there.'}
                  {s?.status === 'behind' && s.requiredMonthly ? ` Needs ${formatMoney(Math.ceil(s.requiredMonthly), goal.currency)} a month.` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}
      {open && <GoalDialog existing={open.existing} initialName={open.name} onClose={() => setOpen(null)} />}
    </>
  )
}
