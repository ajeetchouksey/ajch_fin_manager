import { useMemo, useState } from 'react'
import { ExternalLink, Link2, Loader2, RefreshCw, Upload } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { UploadDocumentsDialog } from '../components/ledger/UploadDocumentsDialog'
import { ErrorNote, TagChips } from '../components/ledger/ui'
import { DOCUMENT_TYPES, type LedgerDocument } from '../lib/ledger/types'

/** Colour per document type (same palette as categories). */
const TYPE_COLOR: Record<string, string> = {
  'Bank statement': 'var(--color-cat-transport)',
  Receipt: 'var(--color-cat-groceries)',
  Invoice: 'var(--color-cat-shopping)',
  Payslip: 'var(--color-cat-travel)',
  'Tax document': 'var(--color-cat-health)',
  Insurance: 'var(--color-cat-bills)',
  Contract: 'var(--color-cat-housing)',
  Other: 'var(--color-cat-other)',
}
const color = (type: string) => TYPE_COLOR[type] ?? 'var(--color-cat-other)'
const plural = (t: string) => (t === 'Other' ? 'Other' : t === 'Insurance' ? 'Insurance' : `${t}s`)

/** What each empty type is for (design: "Nothing here yet"). */
const WHY: Record<string, string> = {
  Payslip: 'Monthly payslip: lets you check salary against the bank.',
  'Tax document': 'Tax certificates and assessments for your tax return.',
  Insurance: 'Health, liability and home insurance policies.',
  Contract: 'Rental agreement, mobile and internet contracts.',
  'Bank statement': 'Monthly statements, also used to import transactions.',
  Receipt: 'Photos of receipts, linked to the payment.',
}

const ext = (d: LedgerDocument) => (d.fileName.split('.').pop() || d.mimeType.split('/').pop() || 'file').slice(0, 4).toUpperCase()
const day = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
/** Two records are copies when title, type, date, file name and kind all match. */
const dupKey = (d: LedgerDocument) => [d.title.trim().toLowerCase(), d.type, d.date, d.fileName.trim().toLowerCase(), d.mimeType].join('|')

/** Documents (design): type tabs with counts, a duplicates prompt, document cards, and what is still missing. */
export function DocumentsPage() {
  const { status, documents, transactions, refresh, deleteDocumentRecord, busy, error, location } = useLedger()
  const [uploading, setUploading] = useState(false)
  const [type, setType] = useState('All')
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)

  // The first copy of each file stays; later uploads of the same file are duplicates
  const duplicates = useMemo(() => {
    const seen = new Set<string>()
    const dups: LedgerDocument[] = []
    for (const d of [...documents].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))) {
      const k = dupKey(d)
      if (seen.has(k)) dups.push(d)
      else seen.add(k)
    }
    return dups
  }, [documents])
  const dupIds = new Set(duplicates.map((d) => d.id))

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of documents) m.set(d.type, (m.get(d.type) ?? 0) + 1)
    return m
  }, [documents])
  const tabs = ['All', ...DOCUMENT_TYPES.filter((t) => t !== 'Other' || counts.get('Other'))]
  const list = useMemo(
    () => [...documents].filter((d) => type === 'All' || d.type === type).sort((a, b) => b.date.localeCompare(a.date) || b.uploadedAt.localeCompare(a.uploadedAt)),
    [documents, type],
  )
  const emptyTypes = ['Payslip', 'Tax document', 'Insurance', 'Contract', 'Bank statement', 'Receipt'].filter((t) => !counts.get(t))

  const removeDuplicates = async () => {
    setRemoving(true)
    try {
      // Highest sheet row first, so the rows still to delete keep their numbers
      for (const d of [...duplicates].sort((a, b) => (b.row ?? 0) - (a.row ?? 0))) await deleteDocumentRecord(d)
      setConfirming(false)
    } catch {
      /* shown from context */
    } finally {
      setRemoving(false)
    }
  }

  const ready = status === 'ready'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={location ? `Stored in your Google Drive · ${location.folderName} folder` : 'Stored in your Google Drive'}
        title="Documents"
        actions={
          ready ? (
            <>
              <button type="button" className="icon-btn border border-line-strong" aria-label="Reload from Drive" onClick={() => void refresh()} disabled={busy}>
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload document</button>
            </>
          ) : undefined
        }
      />

      {!ready ? (
        <div className="card"><ConnectDrive context="documents" /></div>
      ) : (
        <>
          {documents.length > 0 && (
            <div role="tablist" aria-label="Document type" className="flex flex-wrap gap-2">
              {tabs.map((t) => {
                const on = t === type
                const n = t === 'All' ? documents.length : counts.get(t) ?? 0
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setType(t)}
                    className={`flex min-h-10 items-center gap-2 rounded-full border px-4 font-semibold ${on ? 'border-panel bg-panel text-white' : 'border-line bg-surface text-ink hover:border-line-strong'}`}
                  >
                    {t !== 'All' && <span className="h-2 w-2 rounded-full" style={{ background: color(t) }} aria-hidden />}
                    {t === 'All' ? 'All' : plural(t)}
                    <span className={`rounded-full px-2 text-xs ${on ? '' : 'bg-subtle text-slate-400'}`} style={on ? { background: 'rgb(255 255 255 / 0.2)' } : undefined}>{n}</span>
                  </button>
                )
              })}
            </div>
          )}

          {duplicates.length > 0 && (
            <section aria-label="Duplicates" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warn-line bg-warn-bg px-5 py-4">
              <p className="text-warn-text">
                <b>{duplicates.length} document{duplicates.length === 1 ? ' is' : 's are'} saved twice.</b>{' '}
                {duplicates.slice(0, 2).map((d) => d.title).join(' and ')}
                {duplicates.length > 2 ? ` and ${duplicates.length - 2} more` : ''} {duplicates.length === 1 ? 'has' : 'have'} an identical copy. Removing moves the copies to Trash.
              </p>
              {confirming ? (
                <span className="flex gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={removing}>Cancel</button>
                  <button type="button" className="btn bg-panel text-white" onClick={() => void removeDuplicates()} disabled={removing}>
                    {removing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    Move {duplicates.length} to Trash
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>Remove duplicates</button>
              )}
            </section>
          )}

          <ErrorNote>{error}</ErrorNote>

          {list.length > 0 && (
            <section aria-label="Saved documents" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {list.map((d) => {
                const linked = transactions.filter((t) => d.transactionIds.includes(t.id) || t.documentIds.includes(d.id))
                const c = color(d.type)
                return (
                  <article key={d.id} className="card flex flex-col gap-3 p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-ink" style={{ background: `color-mix(in srgb, ${c} 22%, transparent)` }}>
                        {ext(d)}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-semibold text-ink">{d.title}</span>
                        <span className="text-sm text-slate-400">{d.type} · {day(d.date)}</span>
                      </span>
                    </div>
                    {(d.notes || linked.length > 0) && (
                      <p className="line-clamp-3 text-sm leading-[1.45] text-slate-300">
                        {d.notes || `Linked to ${linked.length} transaction${linked.length === 1 ? '' : 's'}.`}
                      </p>
                    )}
                    {d.notes && linked.length > 0 && (
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-400"><Link2 className="h-3.5 w-3.5 shrink-0" /> {linked.map((t) => t.description).join(', ')}</p>
                    )}
                    <TagChips tags={d.tags} />
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      {dupIds.has(d.id) ? <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn-text">Duplicate</span> : <span />}
                      <a href={d.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold text-accent">
                        Open in Drive <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    </div>
                  </article>
                )
              })}
            </section>
          )}
          {documents.length > 0 && list.length === 0 && <p className="py-6 text-center text-slate-400">No {plural(type).toLowerCase()} yet.</p>}

          {emptyTypes.length > 0 && (type === 'All' || emptyTypes.includes(type)) && (
            <section aria-labelledby="missing-heading" className="flex flex-col gap-3">
              <h2 id="missing-heading" className="card-title text-2xl">{documents.length ? 'Nothing here yet' : 'Start your document folder'}</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                {emptyTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUploading(true)}
                    className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-line-strong bg-surface p-5 text-left hover:border-tintline hover:bg-tint"
                  >
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color(t) }} aria-hidden />
                      {plural(t)}
                    </span>
                    <span className="text-sm leading-[1.45] text-slate-400">{WHY[t]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {location?.folderLink && (
            <p className="text-center text-xs text-slate-500">
              Files live in <a className="text-accent hover:underline" href={location.folderLink} target="_blank" rel="noreferrer">{location.folderName} → Documents</a> in your Drive.
            </p>
          )}
        </>
      )}

      {uploading && <UploadDocumentsDialog onClose={() => setUploading(false)} />}
    </div>
  )
}
