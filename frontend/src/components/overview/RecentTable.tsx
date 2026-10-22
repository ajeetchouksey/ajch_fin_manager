import { Link } from 'react-router-dom'
import { categoryColor, categoryTint } from '../../lib/ledger/categoryColors'
import { merchantText } from '../../lib/ledger/categorize'
import { formatMoney, type Transaction } from '../../lib/ledger/types'

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Payee name for lists: the merchant inside PayPal texts, without booking noise, short. */
export function payeeName(t: Transaction): string {
  return merchantText(t.description).split(/\s[—–-]\s|,|\//)[0].trim().slice(0, 48) || t.description.slice(0, 48)
}

/** Recent transactions (design): payee with an initial tile, category chip, date, signed amount. */
export function RecentTable({ items }: { items: Transaction[] }) {
  return (
    <section aria-labelledby="tx-heading" className="card flex min-w-0 flex-col gap-3 p-4 sm:p-6 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 id="tx-heading" className="card-title">Recent transactions</h2>
        <Link to="/transactions" className="flex min-h-11 items-center font-semibold text-accent">View all</Link>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-slate-400">No transactions in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.04em] text-slate-500">
                <th scope="col" className="border-b border-line px-2 py-2.5 font-semibold">Payee</th>
                <th scope="col" className="hidden border-b border-line px-2 py-2.5 font-semibold sm:table-cell">Category</th>
                <th scope="col" className="hidden border-b border-line px-2 py-2.5 font-semibold sm:table-cell">Date</th>
                <th scope="col" className="border-b border-line px-2 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const name = payeeName(t)
                return (
                  <tr key={t.id}>
                    <td className="border-b border-row py-3 pr-2 pl-0 sm:px-2">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] font-display text-[17px] font-bold text-ink"
                          style={{ background: categoryTint(t.category, 22) }}
                          aria-hidden
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 max-w-[8rem] sm:max-w-none">
                          <span className="block truncate font-medium text-ink">{name}</span>
                          <span className="block text-xs text-slate-500 sm:hidden">{t.category} · {day(t.date)}</span>
                        </span>
                      </div>
                    </td>
                    <td className="hidden border-b border-row px-2 py-3 sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-ink" style={{ background: categoryTint(t.category, 20) }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(t.category) }} aria-hidden />
                        {t.category}
                      </span>
                    </td>
                    <td className="hidden border-b border-row px-2 py-3 whitespace-nowrap text-slate-400 sm:table-cell">{day(t.date)}</td>
                    <td className={`border-b border-row px-2 py-3 text-right text-sm font-semibold whitespace-nowrap tabular-nums sm:text-base ${t.direction === 'in' ? 'text-good' : 'text-ink'}`}>
                      {t.direction === 'in' ? '+' : '−'}
                      {formatMoney(t.amount, t.currency)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
