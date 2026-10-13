import { useMemo, useState } from 'react'
import { ExternalLink, FileText, Image as ImageIcon, Link2, RefreshCw, Search, Upload } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { UploadDocumentsDialog } from '../components/ledger/UploadDocumentsDialog'
import { ErrorNote, TagChips, inputClass, selectClass } from '../components/ledger/ui'
import { DOCUMENT_TYPES } from '../lib/ledger/types'

export function DocumentsPage() {
  const { status, documents, transactions, refresh, busy, error, location } = useLedger()
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...documents]
      .filter((d) => !type || d.type === type)
      .filter((d) => !q || [d.title, d.notes, d.type, d.tags.join(' '), d.fileName].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.uploadedAt.localeCompare(a.uploadedAt))
  }, [documents, query, type])

  const ready = status === 'ready'

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Documents"
        description="Receipts, statements, contracts and tax papers — kept in your Google Drive."
        actions={ready ? <button type="button" className="btn btn-primary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload</button> : undefined}
      />

      {!ready ? (
        <div className="card"><ConnectDrive context="documents" /></div>
      ) : documents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Upload one or many files at once, add notes and tags, and link them to transactions. Photos from your phone work too."
            action={<button type="button" className="btn btn-primary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload documents</button>}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input className={`${inputClass} pl-10`} placeholder="Search titles, notes, tags…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
            </div>
            <div className="flex gap-2">
              <select className={`${selectClass} sm:w-48`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
                <option value="">All types</option>
                {DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <button type="button" className="icon-btn shrink-0 border border-line-strong" aria-label="Reload from Drive" onClick={() => void refresh()} disabled={busy}>
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <ErrorNote>{error}</ErrorNote>
          {list.length === 0 && <p className="py-10 text-center text-slate-400">Nothing matches your search.</p>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => {
              const linked = transactions.filter((t) => d.transactionIds.includes(t.id) || t.documentIds.includes(d.id))
              return (
                <li key={d.id} className="card flex flex-col gap-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
                      {d.mimeType.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{d.title}</p>
                      <p className="text-xs text-slate-400">{d.type} · {d.date}</p>
                    </div>
                    <a href={d.link} target="_blank" rel="noreferrer" className="icon-btn h-9 w-9 shrink-0" aria-label={`Open ${d.title} in Google Drive`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {d.notes && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-300">{d.notes}</p>}
                  <TagChips tags={d.tags} />
                  {linked.length > 0 && (
                    <p className="flex items-center gap-1.5 truncate text-xs text-slate-400">
                      <Link2 className="h-3.5 w-3.5 shrink-0" /> {linked.map((t) => t.description).join(', ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          {location?.folderLink && (
            <p className="text-center text-xs text-slate-500">
              Files live in <a className="text-brand-soft hover:underline" href={location.folderLink} target="_blank" rel="noreferrer">{location.folderName} › Documents</a> in your Drive.
            </p>
          )}
        </div>
      )}

      {uploading && <UploadDocumentsDialog onClose={() => setUploading(false)} />}
    </>
  )
}
