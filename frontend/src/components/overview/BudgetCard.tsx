import { Target } from 'lucide-react'
import { formatMoney } from '../../lib/ledger/types'
import type { BudgetProgress } from '../../lib/ledger/budgets'

const BAR: Record<BudgetProgress['state'], string> = { ok: 'bg-brand-success', warn: 'bg-amber-300', over: 'bg-rose-400' }

/** Each budget for the period: spent against the limit, most used first. */
export function BudgetCard({ rows, currency, noun, onEdit, hasBudgets }: { rows: BudgetProgress[]; currency: string; noun: string; onEdit: () => void; hasBudgets: boolean }) {
  if (!hasBudgets) {
    return (
      <div className="px-5 py-8 text-center sm:px-6">
        <Target className="mx-auto mb-3 h-8 w-8 text-slate-500" aria-hidden />
        <p className="text-sm text-slate-300">Set a monthly limit for the categories you want to keep in check.</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={onEdit}>Set budgets</button>
      </div>
    )
  }
  if (!rows.length) {
    return (
      <div className="px-5 py-8 text-center text-sm text-slate-400 sm:px-6">
        No budgets in {currency} yet. <button type="button" className="font-medium text-brand-soft hover:underline" onClick={onEdit}>Set budgets</button>
      </div>
    )
  }
  return (
    <div className="px-5 py-4 sm:px-6">
      <ul className="space-y-3">
        {rows.map((r) => {
          const pct = Math.min(100, Math.round(r.used * 100))
          return (
            <li key={r.category}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-slate-200">{r.category}</span>
                <span className="shrink-0 tabular-nums text-slate-300">
                  {formatMoney(r.spent, currency)} <span className="text-slate-500">of {formatMoney(r.limit, currency)}</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`${r.category}: ${pct}% of budget used`}>
                <div className={`h-2 rounded-full transition-[width] ${BAR[r.state]}`} style={{ width: `${Math.max(pct ? 2 : 0, pct)}%` }} />
              </div>
              <p className={`mt-1 text-xs ${r.state === 'over' ? 'text-rose-300' : r.state === 'warn' ? 'text-amber-200' : 'text-slate-500'}`}>
                {r.state === 'over'
                  ? `Over by ${formatMoney(Math.abs(r.remaining), currency)} ${noun}`
                  : r.state === 'warn'
                    ? `${formatMoney(r.remaining, currency)} left ${noun}, getting close`
                    : `${formatMoney(r.remaining, currency)} left ${noun}`}
              </p>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 text-right">
        <button type="button" className="text-sm font-medium text-brand-soft hover:underline" onClick={onEdit}>Edit budgets</button>
      </div>
    </div>
  )
}
