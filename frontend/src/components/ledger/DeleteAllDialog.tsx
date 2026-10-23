import { useState } from 'react'
import { useLedger } from '../../context/LedgerContext'
import { Dialog } from '../Dialog'

const WORD = 'DELETE'

/**
 * "Delete all data" (Settings): clears the Ledger after a typed confirmation. Transactions and accounts
 * go to Trash for 30 days; goals and budgets have no Trash, so the dialog says they are removed for good.
 * Files in Drive and the profile are not touched.
 */
export function DeleteAllDialog({ onClose }: { onClose: () => void }) {
  const { transactions, accounts, goals, budgets, clearLedger } = useLedger()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = typed.trim().toUpperCase() === WORD

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const toTrash = [plural(transactions.length, 'transaction'), plural(accounts.length, 'account')]
  const forever = [plural(goals.length, 'goal'), plural(budgets.length, 'budget')]

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await clearLedger()
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Your data could not be deleted. Nothing was lost; please try again.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      onClose={busy ? () => undefined : onClose}
      title="Delete all data?"
      subtitle="This clears your Ledger. It is not easy to undo."
      fitContent
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn bg-red-500 text-white hover:bg-red-500/90 disabled:opacity-50" onClick={() => void run()} disabled={!ok || busy}>
            {busy ? 'Deleting…' : 'Delete all data'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4 text-sm text-slate-300">
        <p>
          <b className="text-ink">{toTrash.join(' and ')}</b> will move to Trash. You can restore them there for 30 days.
        </p>
        <p>
          <b className="text-ink">{forever.join(' and ')}</b> have no Trash, so they are removed for good.
        </p>
        <p className="text-slate-400">Your documents in Google Drive, your profile and your categorisation rules stay as they are.</p>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
          Type {WORD} to confirm
          <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={busy} />
        </label>
        {error && <p role="alert" className="text-bad">{error}</p>}
      </div>
    </Dialog>
  )
}
