import { Link } from 'react-router-dom'
import { formatMoney } from '../../lib/ledger/types'
import { accountBalances } from '../../lib/ledger/balances'
import type { Account, BalanceEntry } from '../../lib/ledger/portfolio'
import type { Transaction } from '../../lib/ledger/types'

/**
 * The first thing on the Overview: how much you have in total, in the selected currency.
 * Net worth is assets minus debts, from each account's current balance (see balances.ts).
 */
export function TotalHero({
  accounts,
  history,
  transactions,
  currency,
  today,
}: {
  accounts: Account[]
  history: BalanceEntry[]
  transactions: Transaction[]
  currency: string
  today: string
}) {
  const b = accountBalances(accounts, currency, history, transactions, today)

  if (b.rows.length === 0) {
    return (
      <section className="card px-5 py-6 sm:px-6" aria-label="Your total">
        <p className="text-sm text-slate-400">Your total</p>
        <p className="mt-1 text-base text-slate-300">
          Add your accounts and their balances to see how much you have. <Link to="/accounts" className="underline">Add an account</Link>
        </p>
      </section>
    )
  }

  return (
    <section className="card px-5 py-6 sm:px-6" aria-label="Your total">
      <p className="text-sm font-medium text-slate-400">You have in total</p>
      <p className="mt-1 font-display text-[40px] leading-tight font-semibold tabular-nums text-ink">{formatMoney(b.net, currency)}</p>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
        <span>
          In accounts <span className="font-semibold tabular-nums text-ink">{formatMoney(b.assets, currency)}</span>
        </span>
        {b.debts > 0 && (
          <span>
            Owed <span className="font-semibold tabular-nums text-amber-200">{formatMoney(b.debts, currency)}</span>
          </span>
        )}
        <span className="text-slate-500">{b.rows.filter((r) => r.counted).length} {b.rows.filter((r) => r.counted).length === 1 ? 'account' : 'accounts'}</span>
      </p>
    </section>
  )
}
