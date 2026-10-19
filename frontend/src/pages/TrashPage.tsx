import { useState } from 'react'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { ErrorNote } from '../components/ledger/ui'
import { TRASH_RETENTION_DAYS, daysLeft, type TrashItem } from '../lib/ledger/trash'

const KIND_LABEL: Record<TrashItem['kind'], string> = { transaction: 'Transaction', document: 'Document', account: 'Account', analysis: 'AI analysis' }

/** Items removed from the Ledger. Restore puts them back; erase removes them for good now. */
export function TrashPage() {
  const { status, trash, restoreFromTrash, eraseFromTrash, busy, error } = useLedger()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const ready = status === 'ready'
  const now = new Date()

  // Newest removals first
  const items = [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))

  const act = async (item: TrashItem, action: (i: TrashItem) => Promise<void>) => {
    setWorking(item.id)
    try {
      await action(item)
    } catch {
      /* shown in the error note */
    } finally {
      setWorking(null)
      setConfirming(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Trash"
        description={`Removed items stay here for ${TRASH_RETENTION_DAYS} days, then they are erased. Restore anything removed by mistake.`}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {!ready ? (
        <div className="card">
          <ConnectDrive context="transactions" />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState icon={Trash2} title="Trash is empty" description="Transactions and documents you remove appear here, so you can put them back." />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((item) => {
            const left = daysLeft(item, now)
            const isWorking = working === item.id
            return (
              <li key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{item.title}</p>
                  <p className="text-sm text-slate-500">
                    {KIND_LABEL[item.kind]} · removed {item.deletedAt.slice(0, 10)} · {left} {left === 1 ? 'day' : 'days'} left
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {confirming === item.id ? (
                    <>
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)} disabled={busy}>Keep</button>
                      <button
                        type="button"
                        className="btn bg-red-500/90 text-white hover:bg-red-500"
                        disabled={busy}
                        onClick={() => void act(item, eraseFromTrash)}
                      >
                        {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}Erase for good
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-ghost text-red-300" onClick={() => setConfirming(item.id)} disabled={busy}>
                        <Trash2 className="h-4 w-4" /> Erase now
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => void act(item, restoreFromTrash)} disabled={busy}>
                        {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
