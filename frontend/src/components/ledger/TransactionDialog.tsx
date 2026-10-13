import { useRef, useState } from 'react'
import { Loader2, ScanText, ShieldCheck } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions, readLastEntry, writeLastEntry } from '../../hooks/useLedgerOptions'
import { EXTRACTABLE_ACCEPT, parseReceipt, readFileText, type ExtractProgress } from '../../lib/ledger/extract'
import { CURRENCIES, DOCUMENT_TYPES, parseTags, todayIso, type Direction, type Transaction } from '../../lib/ledger/types'
import { ErrorNote, Field, FilePicker, TagInput, inputClass, selectClass } from './ui'

/** Add a single transaction (with notes, tags and attachments) or edit an existing one. */
export function TransactionDialog({ onClose, existing }: { onClose: () => void; existing?: Transaction }) {
  const { addTransaction, updateTransaction, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const last = readLastEntry()

  const [direction, setDirection] = useState<Direction>(existing?.direction ?? 'out')
  const [date, setDate] = useState(existing?.date ?? todayIso())
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? opts.defaultCurrency)
  const [account, setAccount] = useState(existing?.account ?? last.account ?? '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [docType, setDocType] = useState('Receipt')
  const [localError, setLocalError] = useState<string | null>(null)
  const receiptRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState<ExtractProgress | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  /** Reads a receipt or invoice on this device, pre-fills the form and attaches the file. */
  const fillFromReceipt = async (file: File) => {
    setLocalError(null)
    setScanNote(null)
    if (file.size > 15 * 1024 * 1024) return setLocalError('That file is larger than 15 MB.')
    setScanning({ status: 'Starting' })
    try {
      const { lines } = await readFileText(file, setScanning)
      const r = parseReceipt(lines)
      const found: string[] = []
      setDirection('out')
      if (r.amount) {
        setAmount(r.amount.toFixed(2))
        found.push('amount')
      }
      if (r.date) {
        setDate(r.date)
        found.push('date')
      }
      if (r.merchant && !description.trim()) {
        setDescription(r.merchant)
        found.push('shop')
      }
      if (r.currency) setCurrency(r.currency)
      setFiles((fs) => (fs.includes(file) ? fs : [...fs, file]))
      setDocType(/invoice|rechnung/i.test(lines.join(' ')) ? 'Invoice' : 'Receipt')
      setScanNote(
        found.length
          ? `Filled in the ${found.join(', ')} from ${file.name}. Please check them. The file will be attached.`
          : `Couldn't read the details from ${file.name}. Please type them in. The file will still be attached.`,
      )
    } catch (err) {
      setLocalError((err as Error)?.message || 'That file could not be read.')
    } finally {
      setScanning(null)
    }
  }

  const categories = direction === 'out' ? opts.expenseCategories : opts.incomeCategories
  const currencies = Array.from(new Set([currency, opts.defaultCurrency, ...CURRENCIES].filter(Boolean)))

  const submit = async () => {
    setLocalError(null)
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return setLocalError('Enter an amount greater than 0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setLocalError('Choose a date.')
    if (!description.trim()) return setLocalError('Add a short description, for example the shop or who paid you.')
    const fields = {
      date,
      direction,
      amount: Math.round(value * 100) / 100,
      currency,
      account: account.trim(),
      category: category || (direction === 'out' ? 'Other' : 'Other income'),
      description: description.trim().slice(0, 200),
      notes: notes.trim().slice(0, 2000),
      tags: parseTags(tags),
    }
    try {
      if (existing) {
        await updateTransaction({ ...existing, ...fields })
      } else {
        await addTransaction(
          fields,
          files.map((file) => ({ file, title: file.name.replace(/\.[^.]+$/, ''), type: docType, date, notes: '', tags: fields.tags })),
        )
      }
      writeLastEntry({ currency, account: fields.account })
      onClose()
    } catch {
      /* error shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={existing ? 'Edit transaction' : 'Add transaction'}
      subtitle="Saved to the Ledger in your Google Drive"
      fitContent
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !!scanning}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? (files.length ? 'Uploading…' : 'Saving…') : existing ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      }
    >
      <form
        className="space-y-5 px-4 py-5 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {!existing && (
          <div>
            <button type="button" className="btn btn-secondary w-full" disabled={!!scanning || busy} onClick={() => receiptRef.current?.click()}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
              {scanning ? `${scanning.status}${scanning.progress !== undefined ? ` · ${Math.round(scanning.progress * 100)}%` : ''}` : 'Fill from a receipt or invoice'}
            </button>
            <input
              ref={receiptRef}
              type="file"
              accept={EXTRACTABLE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void fillFromReceipt(f)
              }}
            />
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> {scanNote ?? 'Photo or PDF. Read on this device; nothing is sent to our servers.'}
            </p>
          </div>
        )}

        <div role="radiogroup" aria-label="Money in or out" className="grid grid-cols-2 gap-1 rounded-xl border border-line-strong p-1">
          {(['out', 'in'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              onClick={() => {
                setDirection(d)
                setCategory('')
              }}
              className={`min-h-10 rounded-lg text-sm font-semibold transition-colors ${direction === d ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {d === 'out' ? 'Money out' : 'Money in'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount" htmlFor="tx-amount">
            <input id="tx-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!existing} />
          </Field>
          <Field label="Currency" htmlFor="tx-currency">
            <select id="tx-currency" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="tx-date">
            <input id="tx-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="tx-category">
            <select id="tx-category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description" htmlFor="tx-desc" hint={direction === 'out' ? 'Shop, payee or what it was for' : 'Who paid you, or what for'}>
          <input id="tx-desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder={direction === 'out' ? 'e.g. REWE weekly shop' : 'e.g. October salary'} />
        </Field>

        <Field label="Account" htmlFor="tx-account" hint="Optional. Type a name like “Sparkasse current” or pick one.">
          <input id="tx-account" list="tx-accounts" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} maxLength={80} placeholder="e.g. Current account" />
          <datalist id="tx-accounts">
            {opts.accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>

        <Field label="Notes" htmlFor="tx-notes" hint="Any context you want to remember: why, who with, warranty, split with someone…">
          <textarea id="tx-notes" rows={3} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>

        <Field label="Tags" htmlFor="tx-tags" hint="Separate with commas">
          <TagInput id="tx-tags" value={tags} onChange={setTags} suggestions={opts.tags.length ? opts.tags : ['tax-deductible', 'recurring', 'reimbursable']} />
        </Field>

        {!existing && (
          <div className="space-y-3">
            <FilePicker files={files} onChange={setFiles} />
            {files.length > 0 && (
              <Field label="Document type" htmlFor="tx-doctype">
                <select id="tx-doctype" className={selectClass} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}

        <ErrorNote>{localError || error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
