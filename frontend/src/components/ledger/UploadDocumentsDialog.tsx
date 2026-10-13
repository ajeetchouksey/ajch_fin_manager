import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { DOCUMENT_TYPES, formatMoney, parseTags, todayIso, type Transaction } from '../../lib/ledger/types'
import { ErrorNote, Field, FilePicker, TagInput, inputClass, selectClass } from './ui'

/** Upload one or many documents to Drive, with context, optionally linked to a transaction. */
export function UploadDocumentsDialog({ onClose, transaction }: { onClose: () => void; transaction?: Transaction }) {
  const { uploadDocuments, transactions, documents, busy, error } = useLedger()
  const [files, setFiles] = useState<File[]>([])
  const [titles, setTitles] = useState<Record<number, string>>({})
  const [type, setType] = useState(transaction ? 'Receipt' : 'Other')
  const [date, setDate] = useState(transaction?.date ?? todayIso())
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState(transaction?.tags.join(', ') ?? '')
  const [linkTo, setLinkTo] = useState(transaction?.id ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100)
  const tagSuggestions = Array.from(new Set([...documents.flatMap((d) => d.tags), ...transactions.flatMap((t) => t.tags)])).slice(0, 20)

  const submit = async () => {
    setLocalError(null)
    if (!files.length) return setLocalError('Choose at least one file.')
    try {
      await uploadDocuments(
        files.map((file, i) => ({
          file,
          title: (titles[i] ?? '').trim() || file.name.replace(/\.[^.]+$/, ''),
          type,
          date,
          notes: notes.trim().slice(0, 2000),
          tags: parseTags(tags),
        })),
        linkTo || undefined,
      )
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={transaction ? 'Attach documents' : 'Upload documents'}
      subtitle="Saved in the Documents folder of your Google Drive"
      fitContent
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !files.length}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Uploading…' : `Upload ${files.length > 1 ? `${files.length} files` : ''}`.trim()}
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <FilePicker files={files} onChange={(f) => { setFiles(f); setTitles({}) }} label="Choose files or take a photo" />

        {files.length > 0 && (
          <Field label={files.length > 1 ? 'Titles' : 'Title'}>
            <div className="space-y-2">
              {files.map((f, i) => (
                <input
                  key={`${f.name}-${i}`}
                  aria-label={`Title for ${f.name}`}
                  className={inputClass}
                  placeholder={f.name.replace(/\.[^.]+$/, '')}
                  value={titles[i] ?? ''}
                  onChange={(e) => setTitles((t) => ({ ...t, [i]: e.target.value }))}
                  maxLength={120}
                />
              ))}
            </div>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="doc-type">
            <select id="doc-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              {DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Document date" htmlFor="doc-date">
            <input id="doc-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Notes" htmlFor="doc-notes" hint="What is it, why keep it, warranty end, who it concerns…">
          <textarea id="doc-notes" rows={3} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>

        <Field label="Tags" htmlFor="doc-tags" hint="Separate with commas">
          <TagInput id="doc-tags" value={tags} onChange={setTags} suggestions={tagSuggestions.length ? tagSuggestions : ['tax 2026', 'warranty', 'insurance claim']} />
        </Field>

        {!transaction && (
          <Field label="Link to a transaction" htmlFor="doc-link" hint="Optional">
            <select id="doc-link" className={selectClass} value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>
              <option value="">Not linked</option>
              {recent.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.date} · {t.description} · {formatMoney(t.amount, t.currency, t.direction)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <ErrorNote>{localError || error}</ErrorNote>
      </div>
    </Dialog>
  )
}
