import { useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { linkedWith, parseLink, unlinkRows } from '../../lib/ledger/links'
import { formatMoney, type Transaction } from '../../lib/ledger/types'

/** In the edit dialog: which rows this one is linked to (transfer legs, refund and purchase), and a way to undo it. */
export function LinkedRows({ existing }: { existing: Transaction }) {
  const { transactions, updateTransactions, busy } = useLedger()
  const [error, setError] = useState<string | null>(null)
  const link = parseLink(existing.link)
  if (!link) return null
  const others = linkedWith(transactions, existing)
  const what =
    link.kind === 'transfer'
      ? 'Other half of this move'
      : others.some((o) => o.id === link.ref)
        ? 'Money back from'
        : 'Refunded by'

  const unlink = async () => {
    setError(null)
    try {
      await updateTransactions(unlinkRows(transactions, existing))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change. Try again.')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-subtle px-3.5 py-3 text-sm" aria-label="Linked rows">
      <p className="flex items-center gap-2 font-medium text-ink">
        <Link2 className="h-4 w-4 text-accent" aria-hidden /> {what}
      </p>
      {others.length === 0 && <p className="text-slate-400">The linked row is no longer in the Ledger.</p>}
      {others.map((o) => (
        <p key={o.id} className="text-slate-300">
          {o.description} · {o.date.slice(0, 10)} · {o.account || 'no account'} · {o.direction === 'out' ? '−' : '+'}
          {formatMoney(o.amount, o.currency)}
        </p>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-secondary min-h-9 px-3" disabled={busy} onClick={() => void unlink()}>
          <Unlink className="h-4 w-4" aria-hidden /> Unlink
        </button>
        <span className="text-slate-400">The category stays as it is; change it if the rows are not related.</span>
      </div>
      {error && <p className="text-warn-text" role="alert">{error}</p>}
    </div>
  )
}
