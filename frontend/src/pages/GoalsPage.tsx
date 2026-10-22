import { useMemo, useState } from 'react'
import { GraduationCap, Loader2, Plane, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { GoalDialog } from '../components/portfolio/GoalDialog'
import { ErrorNote } from '../components/ledger/ui'
import { useLedger } from '../context/LedgerContext'
import { useReview } from '../hooks/useReview'
import { accountBalances } from '../lib/ledger/balances'
import { accountType, type Goal } from '../lib/ledger/portfolio'
import { currenciesByUse, monthName, totalsFor } from '../lib/ledger/summary'
import { formatMoney, todayIso } from '../lib/ledger/types'
import { parseNumber } from '../lib/ledger/money'
import type { GoalStatus } from '../lib/analysis/engine'

const IDEAS: Array<{ name: string; note: string; color: string; icon: LucideIcon }> = [
  { name: 'Emergency fund', note: 'A few months of rent, health insurance and bills set aside.', color: 'var(--color-cat-transport)', icon: ShieldCheck },
  { name: 'Education', note: 'Save a fixed amount each month for school and beyond.', color: 'var(--color-cat-health)', icon: GraduationCap },
  { name: 'Family trip', note: 'Plan the next holiday instead of paying for it after.', color: 'var(--color-cat-travel)', icon: Plane },
  { name: 'Investing', note: 'Move a set amount from savings into investments regularly.', color: 'var(--color-cat-groceries)', icon: TrendingUp },
]
const GOAL_COLORS = ['var(--color-cat-transport)', 'var(--color-cat-health)', 'var(--color-cat-travel)', 'var(--color-cat-groceries)', 'var(--color-cat-housing)', 'var(--color-cat-shopping)']

const STATUS: Record<GoalStatus['status'], { label: string; cls: string }> = {
  done: { label: 'Reached', cls: 'bg-good/15 text-good' },
  'on-track': { label: 'On track', cls: 'bg-good/15 text-good' },
  behind: { label: 'Behind', cls: 'bg-warn-bg text-warn-text' },
  'no-plan': { label: 'No monthly plan', cls: 'bg-subtle text-slate-300' },
  'no-date': { label: 'No date', cls: 'bg-subtle text-slate-300' },
}

/** Months from this month to the target month (at least 1). */
function monthsUntil(target: string, today: string): number {
  const [ty, tm] = target.split('-').map(Number)
  const [y, m] = today.split('-').map(Number)
  return Math.max(1, (ty - y) * 12 + (tm - m))
}

/** Savings goals (design): money not assigned to a goal, ideas or your goals, and a New goal form. */
export function GoalsPage() {
  const { status, goals, accounts, balances, transactions, saveGoal, busy, error } = useLedger()
  const { review } = useReview()
  const today = todayIso()
  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? accounts[0]?.currency ?? 'EUR', [transactions, accounts])
  const byId = new Map(review.goals.map((g) => [g.goal.id, g]))
  const [editing, setEditing] = useState<Goal | null>(null)

  // Liquid accounts (current, savings, cash) and how much of them no goal claims
  const bal = useMemo(() => accountBalances(accounts, currency, balances, transactions, today), [accounts, currency, balances, transactions, today])
  const liquid = bal.rows.filter((r) => accountType(accounts.find((a) => a.id === r.id)?.type ?? '').liquid)
  const linked = new Set(goals.map((g) => g.accountId).filter(Boolean))
  const free = liquid.filter((r) => !linked.has(r.id))
  const freeTotal = free.reduce((s, r) => s + r.balance, 0)

  // Left over per month this year, for the panel
  const leftOver = useMemo(() => {
    const months = Array.from(new Set(transactions.filter((t) => t.date.startsWith(today.slice(0, 4))).map((t) => t.date.slice(0, 7))))
      .filter((m) => m < today.slice(0, 7))
      .sort()
    const vals = months.map((m) => ({ m, v: (() => { const x = totalsFor(transactions, m, currency); return x.income - x.spending })() }))
    if (vals.length < 2) return null
    const lo = vals.reduce((a, b) => (b.v < a.v ? b : a))
    const hi = vals.reduce((a, b) => (b.v > a.v ? b : a))
    return { lo, hi }
  }, [transactions, today, currency])

  // New goal form
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  // Until the user picks, count from the first account no goal uses (accounts load after the first render)
  const [fromPick, setFrom] = useState<string | null>(null)
  const from = fromPick ?? free[0]?.id ?? ''
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const targetNum = parseNumber(target) ?? NaN
  const startFrom = from ? liquid.find((r) => r.id === from)?.balance ?? 0 : 0
  const plan =
    Number.isFinite(targetNum) && targetNum > 0 && date
      ? (() => {
          const need = Math.max(0, targetNum - startFrom)
          const months = monthsUntil(date, today)
          return need === 0
            ? `Already covered: ${formatMoney(startFrom, currency)} is more than the target.`
            : `Save about ${formatMoney(Math.ceil(need / months), currency)} a month for ${months} month${months === 1 ? '' : 's'} to reach ${formatMoney(targetNum, currency)} by ${monthName(date)}.`
        })()
      : 'Enter a target and date to see the monthly amount needed.'

  const create = async () => {
    setFormError(null)
    if (!name.trim()) return setFormError('Give the goal a name.')
    if (!Number.isFinite(targetNum) || targetNum <= 0) return setFormError('Enter a target amount above 0.')
    const months = date ? monthsUntil(date, today) : 0
    const monthly = date ? Math.ceil(Math.max(0, targetNum - startFrom) / months) : 0
    setSaving(true)
    try {
      await saveGoal({
        name: name.trim(),
        target: Math.round(targetNum * 100) / 100,
        currency,
        targetDate: date ? `${date}-01` : '',
        saved: 0,
        monthly,
        accountId: from,
        priority: 'medium',
        notes: '',
      })
      setName('')
      setTarget('')
      setDate('')
    } catch {
      /* shown from context */
    } finally {
      setSaving(false)
    }
  }

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Savings goals" />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'}` : 'No goals yet'} title="Savings goals" />

      {liquid.length > 0 && (
        <section aria-label="Unassigned savings" className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-panel p-6 text-white">
          <div className="flex flex-col gap-1.5">
            <span className="text-[#c9c3ec]">{free.length === 1 ? `In ${free[0].name}, not assigned to any goal` : free.length ? 'In your accounts, not assigned to any goal' : 'All your accounts are linked to goals'}</span>
            <span className="font-display text-[44px] leading-none font-bold tabular-nums">{formatMoney(freeTotal, currency)}</span>
          </div>
          {leftOver && (
            <p className="max-w-[420px] leading-normal text-[#c9c3ec]">
              Left over each month this year ranged from <b style={{ color: '#fff' }}>{formatMoney(leftOver.lo.v, currency)}</b> ({monthName(leftOver.lo.m, 'short')}) to{' '}
              <b style={{ color: '#fff' }}>{formatMoney(leftOver.hi.v, currency)}</b> ({monthName(leftOver.hi.m, 'short')}). A goal turns that into a plan.
            </p>
          )}
        </section>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section aria-labelledby="goals-heading" className="flex min-w-0 flex-col gap-3 lg:col-span-2">
          <h2 id="goals-heading" className="card-title text-2xl">{goals.length ? 'Your goals' : 'Start with one'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.length
              ? goals.map((goal, i) => {
                  const s = byId.get(goal.id)
                  const saved = s?.saved ?? goal.saved
                  const progress = s?.progress ?? (goal.target ? Math.min(1, saved / goal.target) : 0)
                  const st = s ? STATUS[s.status] : null
                  const color = GOAL_COLORS[i % GOAL_COLORS.length]
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setEditing(goal)}
                      className="card flex min-h-40 flex-col gap-3 p-5 text-left hover:border-tintline"
                      style={{ borderTop: `6px solid ${color}` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold text-ink">{goal.name}</span>
                        {st && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>}
                      </div>
                      <span className="font-display text-[28px] leading-none font-bold tabular-nums text-ink">
                        {formatMoney(saved, goal.currency)} <span className="font-sans text-sm font-normal text-slate-400">of {formatMoney(goal.target, goal.currency)}</span>
                      </span>
                      <div className="h-2 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`${goal.name} progress`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: color }} />
                      </div>
                      <span className="text-sm leading-[1.45] text-slate-400">
                        {s?.status === 'done'
                          ? 'Target reached.'
                          : s?.projectedMonth
                            ? `At ${formatMoney(goal.monthly, goal.currency)} a month: reached in ${monthName(s.projectedMonth)}.`
                            : s?.requiredMonthly
                              ? `Save about ${formatMoney(Math.ceil(s.requiredMonthly), goal.currency)} a month to make it${goal.targetDate ? ` by ${monthName(goal.targetDate.slice(0, 7))}` : ''}.`
                              : 'Add a monthly amount to see when you get there.'}
                      </span>
                    </button>
                  )
                })
              : IDEAS.map(({ name: n, note, color, icon: Icon }) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setName(n)
                      document.getElementById('goal-name')?.focus()
                    }}
                    className="card flex min-h-40 flex-col gap-3 p-5 text-left hover:border-tintline"
                    style={{ borderTop: `6px solid ${color}` }}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}>
                      <Icon className="h-[22px] w-[22px] text-ink" aria-hidden />
                    </span>
                    <span className="text-base font-semibold text-ink">{n}</span>
                    <span className="leading-[1.45] text-slate-400">{note}</span>
                  </button>
                ))}
          </div>
        </section>

        <section aria-labelledby="ng-heading" className="card flex flex-col gap-4 p-6">
          <h2 id="ng-heading" className="card-title text-2xl">New goal</h2>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
            Name
            <input id="goal-name" className="field" placeholder="e.g. Emergency fund" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
            Target amount ({currency})
            <input className="field" inputMode="decimal" placeholder="Amount" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
            Target date
            <input className="field" type="month" min={today.slice(0, 7)} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
            Count from
            <select className="field" value={from} onChange={(e) => setFrom(e.target.value)}>
              {liquid.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({formatMoney(r.balance, currency)})</option>
              ))}
              <option value="">Start from zero</option>
            </select>
          </label>
          <p className="rounded-xl bg-tint p-3.5 leading-normal text-slate-300" aria-live="polite">{plan}</p>
          <ErrorNote>{formError}</ErrorNote>
          <button type="button" className="btn btn-primary" disabled={busy || saving} onClick={() => void create()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Create goal
          </button>
          <p className="text-xs text-slate-500">You can change the monthly amount, priority and notes later by opening the goal.</p>
        </section>
      </div>

      {editing && <GoalDialog existing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
