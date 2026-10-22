import { Link } from 'react-router-dom'
import { formatMoney } from '../../lib/ledger/types'
import { accountBalances, type AccountBalanceRow } from '../../lib/ledger/balances'
import type { Account, BalanceEntry } from '../../lib/ledger/portfolio'
import type { Transaction } from '../../lib/ledger/types'
import { SectionHeader } from './OverviewParts'

const shortDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date')

/** Each account's current balance, with totals for the currency shown. Debts are shown as amounts owed. */
/** The line under each balance: what it is built from, so the figure can be checked against a statement. */
function basisLine(r: AccountBalanceRow): string {
  const b = r.basis
  const anchor = `${b.anchorDate ? shortDate(b.anchorDate) : 'entered'} balance`
  if (b.transactionsSince === 0) return `${anchor}`
  return `${anchor} + ${b.transactionsSince} ${b.transactionsSince === 1 ? 'transaction' : 'transactions'} since`
}

export function AccountBalances({ accounts, currency, history, transactions }: { accounts: Account[]; currency: string; history: BalanceEntry[]; transactions: Transaction[] }) {
  const b = accountBalances(accounts, currency, history, transactions)

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
                  <span className="block truncate text-[15px] font-medium text-ink">{r.name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {[r.institution, r.groupLabel].filter(Boolean).join(' · ')} · {basisLine(r)}
                    {!r.counted && ' · not in net worth'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-sm font-semibold tabular-nums ${r.group === 'debt' ? 'text-amber-200' : 'text-ink'}`}>
                    {r.group === 'debt' ? `${formatMoney(r.balance, currency)} owed` : formatMoney(r.balance, currency)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-3 gap-3 border-t border-line px-5 py-4 text-sm sm:px-6">
            <div>
              <dt className="text-slate-400">Assets</dt>
              <dd className="font-semibold tabular-nums text-ink">{formatMoney(b.assets, currency)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Debts</dt>
              <dd className="font-semibold tabular-nums text-amber-200">{formatMoney(b.debts, currency)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Net worth</dt>
              <dd className="font-semibold tabular-nums text-ink">{formatMoney(b.net, currency)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
