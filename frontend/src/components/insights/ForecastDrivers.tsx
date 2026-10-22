import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { formatMoney } from '../../lib/ledger/types'
import type { ForecastDrivers as Drivers } from '../../lib/analysis/engine'

interface Row {
  label: string
  amount: number
  kind: 'in' | 'out' | 'margin'
}

/**
 * Why the forecast moves the way it does: one row per monthly change, each with a bar sized against
 * the largest item, then the net change. Estimates are labelled as estimates.
 */
export function ForecastDrivers({ d, currency }: { d: Drivers; currency: string }) {
  const all: Row[] = [
    { label: 'Average income', amount: d.income, kind: 'in' },
    { label: 'Average spending', amount: -d.spending, kind: 'out' },
    { label: 'Safety margin (10% of spending)', amount: -d.margin, kind: 'margin' },
    { label: 'Moved to savings and investments', amount: -d.saving, kind: 'out' },
    { label: 'Interest on cash', amount: d.interest, kind: 'in' },
  ]
  const rows = all.filter((r) => Math.abs(r.amount) >= 0.005)

  if (!d.basisMonths) {
    return (
      <p className="px-5 py-4 text-sm text-slate-400 sm:px-6">
        No complete month of transactions yet, so this estimate only changes with planned savings and investments.
      </p>
    )
  }

  const largest = Math.max(1, ...rows.map((r) => Math.abs(r.amount)))
  const tone = { in: 'bg-brand-success/70', out: 'bg-rose-400/70', margin: 'bg-amber-300/70' }
  const Icon = { in: ArrowUp, out: ArrowDown, margin: ArrowDown }

  return (
    <div className="px-5 py-4 sm:px-6">
      <p className="mb-3 text-sm font-semibold text-ink">Estimated change in cash each month</p>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const I = Icon[r.kind]
          return (
            <li key={r.label} className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[1rem_minmax(0,1fr)_40%_auto]">
              <I className={`h-4 w-4 ${r.amount >= 0 ? 'text-brand-success' : 'text-rose-300'}`} aria-hidden />
              <span className="truncate text-slate-200">{r.label}</span>
              <span className="col-span-3 h-2 overflow-hidden rounded-full bg-wash/5 sm:col-span-1 sm:col-start-3 sm:row-start-auto" aria-hidden>
                <span className={`block h-full rounded-full ${tone[r.kind]}`} style={{ width: `${Math.max(2, (Math.abs(r.amount) / largest) * 100)}%` }} />
              </span>
              <span className={`text-right tabular-nums ${r.amount >= 0 ? 'text-brand-success' : 'text-slate-200'}`}>
                {r.amount >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(r.amount), currency)}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          {d.net >= 0 ? <ArrowUp className="h-4 w-4 text-brand-success" /> : <Minus className="h-4 w-4 text-rose-300" />}
          Net change per month
        </span>
        <span className={`tabular-nums font-semibold ${d.net >= 0 ? 'text-brand-success' : 'text-rose-300'}`}>
          {d.net >= 0 ? '+' : '−'}
          {formatMoney(Math.abs(d.net), currency)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Estimate, based on the average of your last {d.basisMonths} complete month{d.basisMonths > 1 ? 's' : ''}. Bars are sized against the largest item.
      </p>
    </div>
  )
}
