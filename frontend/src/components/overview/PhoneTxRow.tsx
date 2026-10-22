import { categoryColor, categoryTint } from '../../lib/ledger/categoryColors'
import { formatMoney, type Transaction } from '../../lib/ledger/types'
import { payeeName } from './RecentTable'

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** One transaction on phones (design: Mobile, MobileTransactions): initial tile, payee, category, signed amount. */
export function PhoneTxRow({ tx, meta, onOpen, border }: { tx: Transaction; meta: 'date' | 'category'; onOpen?: () => void; border?: boolean }) {
  const name = payeeName(tx)
  const other = tx.category === 'Other'
  const inner = (
    <>
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[17px] font-bold text-ink"
        style={{ background: categoryTint(tx.category, 22) }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate font-medium text-ink">{name}</span>
        {meta === 'date' ? (
          <span className="text-[13px] text-slate-400">{tx.category} · {day(tx.date)}</span>
        ) : (
          <span className={`flex items-center gap-1.5 text-xs ${other ? 'text-warn-text' : 'text-slate-400'}`}>
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: other ? 'var(--color-spend)' : categoryColor(tx.category) }} />
            {other ? 'Other · needs a category' : tx.category}
          </span>
        )}
      </span>
      <span className={`font-semibold whitespace-nowrap tabular-nums ${tx.direction === 'in' ? 'text-good' : 'text-ink'}`}>
        {tx.direction === 'in' ? '+' : '−'}
        {formatMoney(tx.amount, tx.currency)}
      </span>
    </>
  )
  const cls = `flex w-full items-center gap-3 py-2 ${border ? 'border-b border-row' : ''}`
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen}>{inner}</button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
