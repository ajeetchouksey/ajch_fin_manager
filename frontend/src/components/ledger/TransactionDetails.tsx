import { useState } from 'react'
import { ExternalLink, FileText, Loader2, Paperclip, Pencil, Trash2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { formatMoney, type Transaction } from '../../lib/ledger/types'
import { ErrorNote, TagChips } from './ui'

/** Read view of one transaction, with edit / attach / delete. */
export function TransactionDetails({ tx, onClose, onEdit, onAttach }: { tx: Transaction; onClose: () => void; onEdit: () => void; onAttach: () => void }) {
  const { documents, deleteTransaction, busy, error } = useLedger()
  const [confirming, setConfirming] = useState(false)
  const docs = documents.filter((d) => tx.documentIds.includes(d.id) || d.transactionIds.includes(tx.id))

  const rows: Array<[string, string]> = [
    ['Date', tx.date],
    ['Category', tx.category],
    ['Account', tx.account || '—'],
    ['Added', tx.source === 'import' ? 'Imported' : 'Manually'],
  ]

  return (
    <Dialog
      onClose={onClose}
      title={tx.description}
      subtitle={formatMoney(tx.amount, tx.currency, tx.direction)}
      fitContent
      footer={
        confirming ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-300">Move this transaction to Trash? You can restore it for 30 days. Attached files stay in Drive.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Keep</button>
              <button
                type="button"
                className="btn bg-red-500/90 text-white hover:bg-red-500"
                disabled={busy}
                onClick={async () => {
                  try {
                    await deleteTransaction(tx)
                    onClose()
                  } catch {
                    /* shown below */
                  }
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}Move to Trash
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className="btn btn-ghost text-red-300" onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onAttach}><Paperclip className="h-4 w-4" /> Attach</button>
              <button type="button" className="btn btn-primary" onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-white">{v}</dd>
            </div>
          ))}
        </dl>
        {tx.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm text-slate-500">Tags</p>
            <TagChips tags={tx.tags} />
          </div>
        )}
        <div>
          <p className="mb-1.5 text-sm text-slate-500">Notes</p>
          <p className="whitespace-pre-wrap text-[15px] text-slate-200">{tx.notes || <span className="text-slate-500">No notes yet. Use Edit to add context.</span>}</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-slate-500">Documents</p>
          {docs.length ? (
            <ul className="space-y-1.5">
              {docs.map((d) => (
                <li key={d.id}>
                  <a href={d.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-slate-200 hover:border-brand-soft/50 hover:text-white">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="text-xs text-slate-500">{d.type}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">None attached.</p>
          )}
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Dialog>
  )
}
