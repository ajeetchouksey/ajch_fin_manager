import type { Recurring } from '../../lib/analysis/engine'
import { categoryColor } from '../../lib/ledger/categoryColors'
import { formatMoney } from '../../lib/ledger/types'

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${s}`
}

/** "Around the 6th", "Early each month", "Every week"… from the last payment day and the cadence. */
export function whenLabel(r: Recurring): string {
  if (r.cadence !== 'monthly') return { weekly: 'Every week', quarterly: 'Every quarter', yearly: 'Once a year' }[r.cadence]
  const d = Number(r.lastDate.slice(8, 10))
  if (d <= 3) return 'Early each month'
  if (d >= 27) return 'End of each month'
  return `Around the ${ordinal(d)}`
}

/** Regular payments (design): the biggest recurring money-out items, with when they usually go out. */
export function RegularPayments({ items, currency }: { items: Recurring[]; currency: string }) {
  if (!items.length) return null
  return (
    <section aria-labelledby="rp-heading" className="card flex flex-col gap-1 p-6">
      <h2 id="rp-heading" className="card-title mb-2">Regular payments</h2>
      {items.map((u) => (
        <div key={u.key} className="flex items-center justify-between gap-2 border-t border-row py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: categoryColor(u.category) }} aria-hidden />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium text-ink">{u.name}</span>
              <span className="text-xs text-slate-500">{whenLabel(u)}</span>
            </div>
          </div>
          <span className="font-semibold tabular-nums text-ink">{formatMoney(u.amount, currency)}</span>
        </div>
      ))}
    </section>
  )
}
