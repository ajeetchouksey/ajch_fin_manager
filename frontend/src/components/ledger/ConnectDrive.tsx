import { useState } from 'react'
import { FolderOpen, HardDrive, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { ErrorNote, Field, inputClass } from './ui'

/**
 * Shown wherever Ledger data is needed but Drive is not connected (or the session expired).
 * Explains where data goes, lets the user name the folder, then asks Google for drive.file.
 */
export function ConnectDrive({ context }: { context: 'transactions' | 'documents' | 'settings' }) {
  const { status, busy, error, connect, reconnect, location } = useLedger()
  const [folderName, setFolderName] = useState('AaryaAI Finance')

  if (status === 'checking' || status === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Opening your Ledger…
      </div>
    )
  }

  if (status === 'reconnect') {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line-strong bg-brand/10 text-brand-soft">
          <RefreshCw className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <h3 className="text-xl font-semibold text-ink">Reconnect Google Drive</h3>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">
          For your security, Drive access lasts about an hour. Reconnect to open {location?.folderName ? `“${location.folderName}”` : 'your Ledger'} again.
        </p>
        <div className="mt-5 w-full max-w-sm">
          <ErrorNote>{error}</ErrorNote>
        </div>
        <button type="button" className="btn btn-primary mt-5" onClick={() => void reconnect()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          Reconnect Drive
        </button>
      </div>
    )
  }

  const lead =
    context === 'documents'
      ? 'Receipts, statements and contracts are saved in your own Google Drive.'
      : context === 'transactions'
        ? 'Your transactions are saved in a Google Sheet in your own Drive.'
        : 'Choose where your financial data is kept.'

  return (
    <div className="mx-auto max-w-lg px-5 py-10 sm:px-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line-strong bg-brand/10 text-brand-soft">
        <HardDrive className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-2xl font-semibold text-ink">Connect Google Drive</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-slate-400">{lead}</p>

      <ul className="mt-5 space-y-3 text-sm text-slate-300">
        <li className="flex gap-3">
          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand-soft" />
          <span>
            We create one folder in <b className="text-ink">My Drive</b> with a <b className="text-ink">Ledger</b> sheet and a <b className="text-ink">Documents</b> folder. You can move or rename the folder later; the app still finds it.
          </span>
        </li>
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-soft" />
          <span>Google will ask to let the app see only the files it creates. It cannot see the rest of your Drive, and your money data never goes to our servers.</span>
        </li>
      </ul>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void connect(folderName)
        }}
      >
        <Field label="Folder name" htmlFor="drive-folder" hint="Created in My Drive. If the app already made a folder for you, that one is used.">
          <input id="drive-folder" className={inputClass} value={folderName} onChange={(e) => setFolderName(e.target.value)} maxLength={80} required />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy || !folderName.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          Connect Google Drive
        </button>
      </form>
    </div>
  )
}
