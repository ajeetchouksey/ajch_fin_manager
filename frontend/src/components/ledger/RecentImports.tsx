import { useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { importBatches, type ImportBatch } from '../../lib/ledger/imports'
import { formatMoney } from '../../lib/ledger/types'

const SHOWN = 3

/** The latest imports, each with an Undo that moves its rows to Trash (restorable there). */
export function RecentImports() {
  const { transactions, undoImport, busy } = useLedger()
  const [confirming, setConfirming] = useState<string | null>(null)
  const batches = importBatches(transactions).slice(0, SHOWN)
  if (batches.length === 0) return null

  const undo = async (batch: ImportBatch) => {
    try {
      await undoImport(batch)
    } catch {
      /* shown by the page's error note */
    } finally {
      setConfirming(null)
    }
  }

  return (
    <section className="card px-4 py-4 sm:px-6" aria-label="Recent imports">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300"><History className="h-4 w-4" /> Recent imports</p>
      <ul className="divide-y divide-line">
        {batches.map((b) => (
          <li key={b.createdAt} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="text-ink">
                {b.count} {b.count === 1 ? 'transaction' : 'transactions'} imported {new Date(b.createdAt).toLocaleString()}
              </p>
              <p className="text-slate-500">
                In {formatMoney(b.inflow, b.transactions[0]?.currency ?? 'EUR', 'in')} · Out {formatMoney(b.outflow, b.transactions[0]?.currency ?? 'EUR', 'out')}
              </p>
            </div>
            {confirming === b.createdAt ? (
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)} disabled={busy}>Keep</button>
                <button type="button" className="btn bg-red-500/90 text-white hover:bg-red-500" onClick={() => void undo(b)} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}Move {b.count} to Trash
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost shrink-0 self-start sm:self-auto" onClick={() => setConfirming(b.createdAt)} disabled={busy}>
                Undo import
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
