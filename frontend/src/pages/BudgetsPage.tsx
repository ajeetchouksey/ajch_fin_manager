import { useMemo, useState } from 'react'
import { Info, Loader2, Wand2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useLedger } from '../context/LedgerContext'
import { usePeriodMode } from '../hooks/usePeriodMode'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { ErrorNote, inputClass } from '../components/ledger/ui'
import { BudgetCard } from '../components/overview/BudgetCard'
import { Donut } from '../components/ui/Donut'
import { budgetProgress } from '../lib/ledger/budgets'
import { suggestLimits } from '../lib/ledger/budgetSuggest'
import { categoryColor } from '../lib/ledger/categoryColors'
import { buildPeriods, type Period } from '../lib/ledger/periods'
import { currenciesByUse, monthName, spendingByCategory } from '../lib/ledger/summary'
import { formatMoney, todayIso } from '../lib/ledger/types'
import { parseNumber } from '../lib/ledger/money'

const span = (p: Period) => ({ start: p.start, end: p.end })
const HISTORY = 3

/**
 * Budgets (design): how this period is going, where the money went last period, and monthly limits
 * set against the last three periods' actual spending, with suggestions.
 */
const limitId = (c: string) => `limit-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export function BudgetsPage() {
  const { status, transactions, budgets, saveBudget, deleteBudget, busy, error } = useLedger()
  const [mode] = usePeriodMode()
  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? 'EUR', [transactions])

  const p = useMemo(() => {
    const today = todayIso()
    const salary = mode === 'salary' ? buildPeriods('salary', transactions, today) : []
    const periods = salary.length ? salary : buildPeriods('calendar', transactions, today)
    const isCurrent = (x: Period) => x.open || (x.start <= today && today <= (x.expectedEnd ?? x.end))
    const current = periods.find(isCurrent) ?? periods.at(-1)
    const full = periods.filter((x) => !isCurrent(x) && !x.partial && x.start <= today).slice(-HISTORY)
    return { current, full, salary: salary.length > 0 }
  }, [mode, transactions])

  const label = (x: Period) => (p.salary ? new Date(`${x.start}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : monthName(x.start.slice(0, 7), 'short'))
  const noun = p.salary ? 'this cycle' : 'this month'

  const progress = useMemo(() => (p.current ? budgetProgress(budgets, transactions, span(p.current), currency) : []), [budgets, transactions, p, currency])
  const last = p.full.at(-1)
  const lastShares = useMemo(() => (last ? spendingByCategory(transactions, span(last), currency, 8) : []), [transactions, last, currency])
  const lastTotal = lastShares.reduce((s, x) => s + x.amount, 0)
  const suggestions = useMemo(() => suggestLimits(transactions, p.full.map(span), currency), [transactions, p, currency])

  // Rows: categories with spending in the history, plus any with a budget already
  const existing = useMemo(() => new Map(budgets.filter((b) => b.currency === currency).map((b) => [b.category, b])), [budgets, currency])
  const rows = useMemo(() => {
    const seen = new Set(suggestions.map((s) => s.category))
    return [...suggestions, ...[...existing.keys()].filter((c) => !seen.has(c)).map((category) => ({ category, amounts: p.full.map(() => 0), suggested: null }))]
  }, [suggestions, existing, p])

  const [values, setValues] = useState<Record<string, string>>({})
  const valueOf = (c: string) => values[c] ?? (existing.get(c) ? String(existing.get(c)!.monthly) : '')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const fillSuggestions = () =>
    setValues((v) => {
      const next = { ...v }
      for (const r of rows) if (!valueOf(r.category) && r.suggested) next[r.category] = String(r.suggested)
      return next
    })

  const save = async () => {
    setLocalError(null)
    setSaved(null)
    const changes: Array<() => Promise<unknown>> = []
    for (const r of rows) {
      const raw = valueOf(r.category).trim()
      const was = existing.get(r.category)
      if (!raw) {
        if (was) changes.push(() => deleteBudget(was))
        continue
      }
      const n = parseNumber(raw)
      if (n === null || !Number.isFinite(n) || n <= 0) return setLocalError(`Enter a monthly limit above 0 for ${r.category}, or leave it empty.`)
      const monthly = Math.round(n * 100) / 100
      if (!was || was.monthly !== monthly) changes.push(() => saveBudget({ category: r.category, monthly, currency }, was))
    }
    if (!changes.length) return setSaved('Nothing changed.')
    setSaving(true)
    try {
      for (const run of changes) await run()
      setValues({})
      setSaved(`${changes.length} budget${changes.length === 1 ? '' : 's'} saved.`)
    } catch {
      /* shown from context */
    } finally {
      setSaving(false)
    }
  }

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Budgets" />
        <section className="card" aria-label="Connect Google Drive">
          <ConnectDrive context="transactions" />
        </section>
      </>
    )
  }

  const hasBudgets = existing.size > 0
  // Phones without budgets (design: MobileBudgets): last month's spending, and a limit per category from there
  const setLimitFor = (c: string, spent: number) => {
    const s = suggestions.find((x) => x.category === c)?.suggested ?? Math.ceil(spent)
    if (!valueOf(c)) setValues((v) => ({ ...v, [c]: String(s) }))
    const el = document.getElementById(limitId(c)) as HTMLInputElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus({ preventScroll: true })
  }
  const spikes = rows.filter((r) => 'spike' in r && r.spike)

  return (
    <>
      <PageHeader eyebrow={hasBudgets ? undefined : 'No budgets yet'} title="Budgets" description={`Limits in ${currency} for each ${p.salary ? 'salary cycle' : 'month'}.`} />

      {!hasBudgets && last && lastTotal > 0 && (
        <div className="flex flex-col gap-3 md:hidden">
          <section aria-label="Last month's spending" className="card flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-slate-400">Spent in {p.salary ? `the cycle from ${label(last)}` : monthName(last.start.slice(0, 7)).split(' ')[0]}</span>
              <b className="tabular-nums text-ink">{formatMoney(lastTotal, currency)}</b>
            </div>
            <div role="img" aria-label={`Split: ${lastShares.map((s) => `${s.category} ${formatMoney(s.amount, currency)}`).join(', ')}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {lastShares.map((s) => <div key={s.category} style={{ flex: s.amount, background: categoryColor(s.category) }} />)}
            </div>
            <span className="text-sm text-slate-400">Set a limit for the categories you want to watch. We'll start from what you spent.</span>
          </section>
          {lastShares.map((s) => (
            <div key={s.category} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-3">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded" style={{ background: categoryColor(s.category) }} />
              <div className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-ink">{s.category}</b>
                <span className="text-xs text-slate-400">{label(last)} <span className="tabular-nums">{formatMoney(s.amount, currency)}</span></span>
              </div>
              <button type="button" className="btn btn-secondary min-h-10" onClick={() => setLimitFor(s.category, s.amount)}>Set limit</button>
            </div>
          ))}
        </div>
      )}

      <div className={`grid items-start gap-6 lg:grid-cols-5 ${!hasBudgets && last && lastTotal > 0 ? 'max-md:hidden' : ''}`}>
        <section aria-labelledby="now-heading" className="card lg:col-span-3">
          <h2 id="now-heading" className="px-5 pt-5 text-lg font-semibold text-ink sm:px-6">{p.salary ? 'This cycle' : 'This month'}</h2>
          {hasBudgets ? (
            <BudgetCard rows={progress} currency={currency} noun={noun} hasBudgets onEdit={() => document.getElementById('limits-heading')?.scrollIntoView({ behavior: 'smooth' })} />
          ) : (
            <p className="px-5 pt-2 pb-5 text-sm text-slate-400 sm:px-6">No budgets set yet. Below is what you actually spent; use it as a starting point.</p>
          )}
        </section>

        {last && lastTotal > 0 && (
          <section aria-labelledby="last-heading" className="card p-5 sm:p-6 lg:col-span-2">
            <h2 id="last-heading" className="text-lg font-semibold text-ink">Where the money went</h2>
            <p className="text-sm text-slate-400">{p.salary ? `Cycle from ${label(last)}` : monthName(last.start.slice(0, 7))}</p>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <Donut
                parts={lastShares.map((s) => ({ label: s.category, value: s.amount, color: categoryColor(s.category) }))}
                center={
                  <>
                    <span className="text-xs text-slate-400">Spent</span>
                    <span className="font-display text-xl font-semibold tabular-nums text-ink">{formatMoney(lastTotal, currency)}</span>
                  </>
                }
              />
              <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
                {lastShares.map((s) => (
                  <li key={s.category} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(s.category) }} aria-hidden />
                    <span className="flex-1 truncate text-slate-300">{s.category}</span>
                    <span className="tabular-nums text-slate-200">{formatMoney(s.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>

      <section aria-labelledby="limits-heading" className="card mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 id="limits-heading" className="text-lg font-semibold text-ink">Set monthly limits</h2>
            <p className="text-sm text-slate-400">
              {p.full.length ? `Actual spending in the last ${p.full.length} ${p.salary ? 'cycles' : 'months'}. Leave a limit empty for no budget.` : 'Add a few weeks of transactions to see suggestions.'}
            </p>
          </div>
          {rows.some((r) => r.suggested) && (
            <button type="button" className="btn btn-secondary" onClick={fillSuggestions}>
              <Wand2 className="h-4 w-4" aria-hidden /> Fill empty with suggestions
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400 sm:px-6">No spending yet in {currency}.</p>
        ) : (
          <div className="overflow-x-auto px-2 py-3 sm:px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Category</th>
                  {p.full.map((x) => (
                    <th key={x.start} className="hidden px-3 py-2 text-right font-medium sm:table-cell">{label(x)}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Monthly limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.category}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 text-slate-200">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(r.category) }} aria-hidden />
                        {r.category}
                      </span>
                      {r.suggested !== null && (
                        <span className="ml-[18px] block text-xs text-slate-500 sm:hidden">
                          Usually up to {formatMoney(Math.max(...r.amounts.filter((_, i) => !('spike' in r && r.spike?.index === i))), currency)} a {p.salary ? 'cycle' : 'month'}
                        </span>
                      )}
                    </td>
                    {r.amounts.map((a, i) => (
                      <td
                        key={i}
                        className={`hidden px-3 py-2.5 text-right tabular-nums sm:table-cell ${'spike' in r && r.spike?.index === i ? 'text-amber-200' : a ? 'text-slate-300' : 'text-slate-500'}`}
                      >
                        {a ? formatMoney(a, currency) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <input
                        id={limitId(r.category)}
                        aria-label={`${r.category} monthly limit`}
                        inputMode="decimal"
                        className={`${inputClass} ml-auto w-28 text-right tabular-nums`}
                        placeholder={r.suggested ? String(r.suggested) : 'None'}
                        value={valueOf(r.category)}
                        onChange={(e) => setValues((v) => ({ ...v, [r.category]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {spikes.length > 0 && (
          <ul className="mx-5 mb-3 space-y-2 sm:mx-6">
            {spikes.map((r) => {
              const s = 'spike' in r ? r.spike! : null
              if (!s) return null
              return (
                <li key={r.category} className="flex gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {r.category} was unusually high in {label(p.full[s.index])} ({formatMoney(s.amount, currency)}), for example two payments in one {p.salary ? 'cycle' : 'month'}. The suggestion leaves that {p.salary ? 'cycle' : 'month'} out.
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
          <ErrorNote>{localError || error}</ErrorNote>
          {saved && <span className="text-sm text-slate-400" role="status">{saved}</span>}
          <button type="button" className="btn btn-primary" disabled={busy || saving || rows.length === 0} onClick={() => void save()}>
            {(busy || saving) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save budgets
          </button>
        </div>
      </section>
    </>
  )
}
