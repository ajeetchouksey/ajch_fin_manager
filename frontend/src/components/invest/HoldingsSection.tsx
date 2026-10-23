import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { accountType } from '../../lib/ledger/portfolio'
import { HOLDING_CLASSES, holdingCost, holdingGain, holdingsByAccount, holdingValue, type Holding } from '../../lib/ledger/holdings'
import { positionFrom, returnFrom, TRADE_TYPES, type HoldingReturn, type Trade } from '../../lib/ledger/trades'
import { formatMoney, todayIso } from '../../lib/ledger/types'
import { currentBalance } from '../../lib/ledger/balances'
import { HoldingDialog } from './HoldingDialog'
import { TradeDialog } from './TradeDialog'

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`
const kindLabel = (v: string) => HOLDING_CLASSES.find((c) => c.value === v)?.label ?? 'Other'
const tradeLabel = (v: string) => TRADE_TYPES.find((t) => t.value === v)?.label ?? v

/** One plain line on what the trades add up to. The yearly rate is shown only when it can mean something. */
function ReturnLine({ r, currency }: { r: HoldingReturn; currency: string }) {
  if (r.invested <= 0) return null
  const yearly = r.yearly !== null ? `, about ${pct(r.yearly)} a year since ${r.firstDate}` : ''
  const young = r.yearly === null && r.value !== null && r.tooShort ? ` Too recent for a yearly rate (first buy ${r.firstDate}).` : ''
  return (
    <p className="text-sm text-slate-300">
      Put in {formatMoney(r.invested, currency)}
      {r.received > 0 ? `, received ${formatMoney(r.received, currency)}` : ''}
      {r.value !== null ? `, worth ${formatMoney(r.value, currency)}` : ', no price entered'}
      {r.gain !== null && r.gainShare !== null ? `. ${r.gain >= 0 ? 'Gain' : 'Loss'} ${formatMoney(Math.abs(r.gain), currency)} (${pct(r.gainShare)})` : ''}
      {yearly}.{young}
    </p>
  )
}

/** Expert mode: what is held inside each investment or retirement account, with its trades, prices you enter and the return they add up to. */
export function HoldingsSection() {
  const { accounts, balances, transactions, holdings, trades } = useLedger()
  const [editing, setEditing] = useState<{ holding?: Holding; accountId?: string } | null>(null)
  const [trading, setTrading] = useState<{ holdingId: string; trade?: Trade } | null>(null)
  const today = todayIso()

  const groups = useMemo(() => {
    const invest = accounts.filter((a) => ['investments', 'retirement'].includes(accountType(a.type).group))
    const by = holdingsByAccount(holdings, (id) => accounts.find((a) => a.id === id)?.currency)
    const known = new Set(invest.map((a) => a.id))
    const tradesOf = (id: string) => trades.filter((t) => t.holdingId === id)
    return {
      accounts: invest.map((a) => {
        const items = holdings.filter((h) => h.accountId === a.id)
        // The account's return adds up the holdings that have trades; it needs every one of them to have a price
        const traded = items.filter((h) => tradesOf(h.id).length > 0)
        const values = traded.map((h) => holdingValue(h))
        const combined =
          traded.length > 1
            ? returnFrom(traded.flatMap((h) => tradesOf(h.id)), values.every((v) => v !== null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null, today)
            : null
        return { account: a, items, total: by.get(a.id), balance: currentBalance(a, balances, transactions, today).balance, combined }
      }),
      orphans: holdings.filter((h) => !known.has(h.accountId)),
      tradesOf,
    }
  }, [accounts, balances, transactions, holdings, trades, today])

  return (
    <section aria-labelledby="holdings-heading" className="card flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="holdings-heading" className="card-title">Holdings</h2>
          <p className="text-slate-400">
            What each account holds, its buys, sells and dividends, and the latest price you entered. FinBuddy does not look up prices, so a value is only as fresh as the date beside it.
            Costs use the average-cost method, a way to describe a holding and not a tax calculation.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing({})} disabled={groups.accounts.length === 0}>
          <Plus size={16} aria-hidden /> Add holding
        </button>
      </div>

      {groups.accounts.length === 0 && <p className="text-slate-400">Add an investment or retirement account on the Accounts page first; holdings live inside one.</p>}

      {groups.accounts.map(({ account, items, total, balance, combined }) => (
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
                const own = groups.tradesOf(h.id)
                const pos = positionFrom(own)
                const ret = own.some((t) => t.type === 'buy') ? returnFrom(own, value, today) : null
                return (
                  <li key={h.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-3">
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
                    </div>

                    {ret && <ReturnLine r={ret} currency={h.currency} />}
                    {own.length > 0 && (pos.realised !== 0 || pos.dividends > 0) && (
                      <p className="text-sm text-slate-400">
                        {pos.realised !== 0 ? `${pos.realised > 0 ? 'Gained' : 'Lost'} ${formatMoney(Math.abs(pos.realised), h.currency)} on units sold. ` : ''}
                        {pos.dividends > 0 ? `Dividends after tax ${formatMoney(pos.dividends, h.currency)}.` : ''}
                      </p>
                    )}
                    {pos.oversold > 0 && <p className="text-sm text-warn-text">A sale is larger than the units held before it ({pos.oversold} too many). Check the dates and units.</p>}

                    <details className="text-sm">
                      <summary className="cursor-pointer font-semibold text-accent">Trades ({own.length})</summary>
                      <div className="mt-2 flex flex-col gap-2">
                        {own.length > 0 && (
                          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                            {[...own].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="min-w-0 text-slate-300">
                                  <b className="font-medium text-ink">{tradeLabel(t.type)}</b> {t.date}
                                  {t.type === 'dividend' ? ` - ${formatMoney(t.amount, t.currency)}` : ` - ${t.quantity} at ${formatMoney(t.price, t.currency)}`}
                                  {t.fee > 0 ? `, fees ${formatMoney(t.fee, t.currency)}` : ''}
                                  {t.tax > 0 ? `, tax ${formatMoney(t.tax, t.currency)}` : ''}
                                </span>
                                <button type="button" className="btn btn-ghost" aria-label={`Edit ${tradeLabel(t.type)} of ${t.date}`} onClick={() => setTrading({ holdingId: h.id, trade: t })}>
                                  <Pencil size={14} aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div>
                          <button type="button" className="btn btn-secondary" onClick={() => setTrading({ holdingId: h.id })}><Plus size={14} aria-hidden /> Add trade</button>
                        </div>
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
          )}
          {combined && combined.invested > 0 && (
            <div className="rounded-xl bg-tint p-3">
              <p className="text-sm font-medium text-ink">Holdings with trades, together</p>
              <ReturnLine r={combined} currency={account.currency} />
            </div>
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
      {trading && <TradeDialog holdingId={trading.holdingId} existing={trading.trade} onClose={() => setTrading(null)} />}
    </section>
  )
}
