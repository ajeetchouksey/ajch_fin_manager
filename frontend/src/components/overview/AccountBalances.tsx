import { Link } from 'react-router-dom'
import { formatMoney } from '../../lib/ledger/types'
import { accountBalances } from '../../lib/ledger/balances'
import type { Account } from '../../lib/ledger/portfolio'
import { SectionHeader } from './OverviewParts'

const shortDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date')

/** Each account's current balance, with totals for the currency shown. Debts are shown as amounts owed. */
export function AccountBalances({ accounts, currency }: { accounts: Account[]; currency: string }) {
  const b = accountBalances(accounts, currency)

  return (
    <section aria-labelledby="balances-heading" className="card">
      <SectionHeader id="balances-heading" title="Account balances" to="/accounts" />
      {b.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400 sm:px-6">
          No accounts in {currency} yet. <Link to="/accounts" className="underline">Add an account</Link> to see its balance here.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {b.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-white">{r.name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {[r.institution, r.groupLabel].filter(Boolean).join(' · ')} · as of {shortDate(r.asOf)}
                    {!r.counted && ' · not in net worth'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-sm font-semibold tabular-nums ${r.group === 'debt' ? 'text-amber-200' : 'text-white'}`}>
                    {r.group === 'debt' ? `${formatMoney(r.balance, currency)} owed` : formatMoney(r.balance, currency)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-3 gap-3 border-t border-line px-5 py-4 text-sm sm:px-6">
            <div>
              <dt className="text-slate-400">Assets</dt>
              <dd className="font-semibold tabular-nums text-white">{formatMoney(b.assets, currency)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Debts</dt>
              <dd className="font-semibold tabular-nums text-amber-200">{formatMoney(b.debts, currency)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Net worth</dt>
              <dd className="font-semibold tabular-nums text-white">{formatMoney(b.net, currency)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
