import { categoryColor } from '../../lib/ledger/categoryColors'
import type { CategoryShare } from '../../lib/ledger/summary'
import { formatMoney } from '../../lib/ledger/types'

/** Where it went (design): total, a split strip, then one bar per category against the largest. */
export function WhereItWent({ rows, currency, onPick }: { rows: CategoryShare[]; currency: string; onPick?: (category: string) => void }) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const max = Math.max(...rows.map((r) => r.amount), 1)
  return (
    <section aria-labelledby="cat-heading" className="card flex min-w-0 flex-col gap-4 p-6">
      <div className="flex items-baseline justify-between">
        <h2 id="cat-heading" className="card-title">Where it went</h2>
        <span className="tabular-nums text-slate-400">{formatMoney(total, currency)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-slate-400">No spending in this period.</p>
      ) : (
        <>
          <div role="img" aria-label="Spending split by category" className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
            {rows.map((r) => <div key={r.category} style={{ flex: r.amount, background: categoryColor(r.category) }} />)}
          </div>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.category}>
                <button
                  type="button"
                  disabled={!onPick || r.category === 'Everything else'}
                  onClick={() => onPick?.(r.category)}
                  className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default"
                >
                  <span className="flex w-full justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: categoryColor(r.category) }} aria-hidden />
                      {r.category}
                    </span>
                    <span className="tabular-nums text-slate-300">{formatMoney(r.amount, currency)}</span>
                  </span>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-track">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(1, (r.amount / max) * 100)}%`, background: categoryColor(r.category) }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
