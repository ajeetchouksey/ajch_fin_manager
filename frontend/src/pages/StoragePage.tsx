import { useState } from 'react'
import { ExternalLink, FolderOpen, HardDrive, Sheet, Unlink } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'

/** Settings › Storage: where the Ledger lives, and how to open or unlink it. */
export function StoragePage() {
  const { status, location, transactions, documents, disconnect } = useLedger()
  const [confirm, setConfirm] = useState(false)

  return (
    <>
      <PageHeader eyebrow="Settings" title="Storage" description="Your transactions and documents are kept in your own Google Drive." />
      <div className="card">
        {status !== 'ready' || !location ? (
          <ConnectDrive context="settings" />
        ) : (
          <div className="space-y-6 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-success/15 text-brand-success"><HardDrive className="h-5 w-5" /></span>
              <div>
                <p className="font-semibold text-white">Connected to Google Drive</p>
                <p className="text-sm text-slate-400">{transactions.length} transactions · {documents.length} documents</p>
              </div>
            </div>

            <ul className="space-y-2">
              <li>
                <a href={location.folderLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 hover:border-brand-soft/50">
                  <FolderOpen className="h-5 w-5 text-brand-soft" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-white">{location.folderName}</span>
                    <span className="block text-xs text-slate-400">Folder in My Drive — move or rename it in Drive if you like</span>
                  </span>
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                </a>
              </li>
              <li>
                <a href={location.spreadsheetLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 hover:border-brand-soft/50">
                  <Sheet className="h-5 w-5 text-brand-soft" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-white">Ledger (Google Sheet)</span>
                    <span className="block text-xs text-slate-400">Tabs: Transactions, Documents, Meta. You can edit rows there; keep the header row.</span>
                  </span>
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                </a>
              </li>
            </ul>

            <div className="rounded-xl border border-line p-4 text-sm text-slate-400">
              The app can only see files it created in this folder. Nothing financial is stored on our servers; this device remembers only which file to open.
            </div>

            {confirm ? (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-100">Unlink on this device? Your files stay in Drive, and connecting again finds them.</p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
                  <button type="button" className="btn btn-secondary" onClick={() => { disconnect(); setConfirm(false) }}>Unlink</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost text-slate-300" onClick={() => setConfirm(true)}>
                <Unlink className="h-4 w-4" /> Unlink on this device
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
