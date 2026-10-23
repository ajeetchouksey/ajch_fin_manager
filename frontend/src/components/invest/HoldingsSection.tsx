import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { accountType } from '../../lib/ledger/portfolio'
import { HOLDING_CLASSES, holdingCost, holdingGain, holdingsByAccount, holdingValue, type Holding } from '../../lib/ledger/holdings'
import { formatMoney, todayIso } from '../../lib/ledger/types'
import { currentBalance } from '../../lib/ledger/balances'
import { HoldingDialog } from './HoldingDialog'

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`
const kindLabel = (v: string) => HOLDING_CLASSES.find((c) => c.value === v)?.label ?? 'Other'

/** Expert mode: what is held inside each investment or retirement account, with the prices you enter. */
export function HoldingsSection() {
  const { accounts, balances, transactions, holdings } = useLedger()
  const [editing, setEditing] = useState<{ holding?: Holding; accountId?: string } | null>(null)
  const today = todayIso()

  const groups = useMemo(() => {
    const invest = accounts.filter((a) => ['investments', 'retirement'].includes(accountType(a.type).group))
    const by = holdingsByAccount(holdings, (id) => accounts.find((a) => a.id === id)?.currency)
    const known = new Set(invest.map((a) => a.id))
    return {
      accounts: invest.map((a) => ({ account: a, items: holdings.filter((h) => h.accountId === a.id), total: by.get(a.id), balance: currentBalance(a, balances, transactions, today).balance })),
      orphans: holdings.filter((h) => !known.has(h.accountId)),
    }
  }, [accounts, balances, transactions, holdings, today])

  return (
    <section aria-labelledby="holdings-heading" className="card flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="holdings-heading" className="card-title">Holdings</h2>
          <p className="text-slate-400">
            What each account holds: units, what they cost you on average and the latest price you entered. FinBuddy does not look up prices, so a value is only as fresh as the date beside it.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing({})} disabled={groups.accounts.length === 0}>
          <Plus size={16} aria-hidden /> Add holding
        </button>
      </div>

      {groups.accounts.length === 0 && <p className="text-slate-400">Add an investment or retirement account on the Accounts page first; holdings live inside one.</p>}

      {groups.accounts.map(({ account, items, total, balance }) => (
        <div key={account.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-ink">{account.name}</h3>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing({ accountId: account.id })}><Plus size={14} aria-hidden /> Add here</button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">No holdings listed for this account yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {items.map((h) => {
                const value = holdingValue(h)
                const cost = holdingCost(h)
                const gain = holdingGain(h)
                return (
                  <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{h.name}</span>
                      <span className="block text-sm text-slate-400">
                        {kindLabel(h.assetClass)}
                        {h.isin ? ` - ${h.isin}` : h.symbol ? ` - ${h.symbol}` : ''}
                        {` - ${h.quantity} units`}
                        {cost !== null ? ` - cost ${formatMoney(cost, h.currency)}` : ''}
                      </span>
                      <span className="block text-sm text-slate-400">
                        {h.price !== null ? `Price ${formatMoney(h.price, h.currency)} as of ${h.priceDate || 'an unknown date'}` : 'No price entered'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-start gap-2">
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums text-ink">{value !== null ? formatMoney(value, h.currency) : '-'}</span>
                        {gain && <span className="block text-sm tabular-nums text-slate-300">{gain.amount >= 0 ? '+' : '-'}{formatMoney(Math.abs(gain.amount), h.currency)} ({pct(gain.share)})</span>}
                      </span>
                      <button type="button" className="btn btn-ghost" aria-label={`Edit ${h.name}`} onClick={() => setEditing({ holding: h })}>
                        <Pencil size={16} aria-hidden />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {total && total.value > 0 && (
            <p className="text-sm text-slate-300">
              Holdings add up to {formatMoney(total.value, account.currency)}; the account is recorded at {formatMoney(balance, account.currency)}
              {Math.abs(total.value - balance) >= 1 ? ` (a difference of ${formatMoney(Math.abs(total.value - balance), account.currency)}).` : ', so they agree.'}
              {total.unpriced > 0 ? ` ${total.unpriced} without a price in ${account.currency} ${total.unpriced === 1 ? 'is' : 'are'} not counted.` : ''}
            </p>
          )}
        </div>
      ))}

      {groups.orphans.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-ink">Account no longer exists</h3>
          <ul className="flex flex-col divide-y divide-line">
            {groups.orphans.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-300">{h.name}</span>
                <button type="button" className="btn btn-ghost" aria-label={`Edit ${h.name}`} onClick={() => setEditing({ holding: h })}><Pencil size={16} aria-hidden /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && <HoldingDialog existing={editing.holding} accountId={editing.accountId} onClose={() => setEditing(null)} />}
    </section>
  )
}
