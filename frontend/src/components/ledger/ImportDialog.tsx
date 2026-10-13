import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ClipboardPaste, FileUp, Loader2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions, writeLastEntry } from '../../hooks/useLedgerOptions'
import { guessColumns, parseAmount, parseCsv, parseDate, type DateFormat } from '../../lib/ledger/csv'
import { CURRENCIES, dedupeKey, formatMoney, parseTags, type Direction } from '../../lib/ledger/types'
import { ErrorNote, Field, TagInput, inputClass, selectClass } from './ui'

const MAX_ROWS = 2000
type Step = 'source' | 'map'
type Sign = 'negative-out' | 'positive-out' | 'all-out' | 'all-in'

interface Mapping {
  date?: number
  amount?: number
  description?: number
  category?: number
  notes?: number
}

/** Bulk add: CSV from a bank export, or rows pasted from a spreadsheet. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { importTransactions, transactions, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('source')
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState<Mapping>({})
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [sign, setSign] = useState<Sign>('negative-out')
  const [currency, setCurrency] = useState(opts.defaultCurrency)
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const table = useMemo(() => (raw.trim() ? parseCsv(raw) : []), [raw])
  const header = hasHeader ? table[0] ?? [] : []
  const body = hasHeader ? table.slice(1) : table
  const width = Math.max(0, ...table.map((r) => r.length))
  const columnNames = Array.from({ length: width }, (_, i) => (header[i] ? `${header[i]}` : `Column ${i + 1}`))

  const goToMapping = (text: string, name = '') => {
    setRaw(text)
    setFileName(name)
    const t = parseCsv(text)
    if (t.length < 1) {
      setLocalError('No rows found. Check the file or the pasted text.')
      return
    }
    const looksLikeHeader = t[0].some((c) => /[a-zA-ZäöüÄÖÜ]{3,}/.test(c)) && !t[0].some((c) => parseDate(c) && parseAmount(c) === null)
    setHasHeader(looksLikeHeader)
    const guess = looksLikeHeader ? guessColumns(t[0]) : {}
    if (!looksLikeHeader && t[0].length >= 3) {
      // Typical "date, description, amount" without a header
      const dateCol = t[0].findIndex((c) => parseDate(c))
      const amountCol = t[0].findIndex((c, i) => i !== dateCol && parseAmount(c) !== null && !parseDate(c))
      const descCol = t[0].findIndex((_, i) => i !== dateCol && i !== amountCol)
      Object.assign(guess, { date: dateCol >= 0 ? dateCol : undefined, amount: amountCol >= 0 ? amountCol : undefined, description: descCol >= 0 ? descCol : undefined })
    }
    setMap(guess)
    setLocalError(null)
    setStep('map')
  }

  const existingKeys = useMemo(() => new Set(transactions.map(dedupeKey)), [transactions])

  const preview = useMemo(() => {
    const seen = new Set<string>()
    return body.slice(0, MAX_ROWS).map((r) => {
      const date = map.date !== undefined ? parseDate(r[map.date] ?? '', dateFormat) : null
      const value = map.amount !== undefined ? parseAmount(r[map.amount] ?? '') : null
      const description = (map.description !== undefined ? r[map.description] ?? '' : '').slice(0, 200)
      if (!date || value === null || value === 0) {
        return { ok: false as const, reason: !date ? 'No valid date' : 'No amount', cells: r }
      }
      let direction: Direction
      if (sign === 'all-out') direction = 'out'
      else if (sign === 'all-in') direction = 'in'
      else if (sign === 'negative-out') direction = value < 0 ? 'out' : 'in'
      else direction = value < 0 ? 'in' : 'out'
      const amount = Math.round(Math.abs(value) * 100) / 100
      const rowCategory = map.category !== undefined ? (r[map.category] ?? '').slice(0, 60) : ''
      const rowNotes = map.notes !== undefined ? (r[map.notes] ?? '') : ''
      const tx = {
        date,
        direction,
        amount,
        currency,
        account: account.trim(),
        category: rowCategory || category || (direction === 'out' ? 'Other' : 'Other income'),
        description: description || '(no description)',
        notes: [rowNotes, notes.trim()].filter(Boolean).join(' — ').slice(0, 2000),
        tags: parseTags(tags),
      }
      const key = dedupeKey(tx)
      const duplicate = existingKeys.has(key) || seen.has(key)
      seen.add(key)
      return { ok: true as const, duplicate, tx }
    })
  }, [body, map, dateFormat, sign, currency, account, category, tags, notes, existingKeys])

  const valid = preview.filter((p) => p.ok)
  const toImport = valid.filter((p) => !(skipDuplicates && p.duplicate))
  const dupCount = valid.filter((p) => p.duplicate).length
  const badCount = preview.length - valid.length
  const totals = toImport.reduce(
    (acc, p) => {
      if (p.tx.direction === 'out') acc.out += p.tx.amount
      else acc.in += p.tx.amount
      return acc
    },
    { out: 0, in: 0 },
  )

  const runImport = async () => {
    if (!toImport.length) return
    try {
      const n = await importTransactions(toImport.map((p) => p.tx))
      writeLastEntry({ currency, account: account.trim() || undefined })
      setDone(n)
    } catch {
      /* shown from context */
    }
  }

  const columnSelect = (key: keyof Mapping, label: string, optional = false) => (
    <Field label={label} htmlFor={`map-${key}`}>
      <select
        id={`map-${key}`}
        className={selectClass}
        value={map[key] ?? ''}
        onChange={(e) => setMap((m) => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
      >
        <option value="">{optional ? '— none —' : 'Choose column…'}</option>
        {columnNames.map((n, i) => (
          <option key={i} value={i}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  )

  if (done !== null) {
    return (
      <Dialog onClose={onClose} title="Import complete" fitContent footer={<div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>}>
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-success/15 text-brand-success">
            <Check className="h-6 w-6" />
          </div>
          <p className="text-xl font-semibold text-white">{done} transactions added</p>
          <p className="mt-1 text-sm text-slate-400">They are in the Transactions tab of your Ledger. You can add notes or tags to any of them.</p>
        </div>
      </Dialog>
    )
  }

  if (step === 'source') {
    return (
      <Dialog onClose={onClose} title="Import transactions" subtitle="From a bank export (CSV) or pasted rows" fitContent>
        <div className="space-y-5 px-4 py-5 sm:px-6">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-4 rounded-2xl border border-line-strong p-4 text-left hover:border-brand-soft/50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-soft"><FileUp className="h-5 w-5" /></span>
            <span>
              <span className="block font-semibold text-white">Upload a CSV file</span>
              <span className="block text-sm text-slate-400">Most banks offer “Export as CSV” in online banking.</span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (f.size > 5 * 1024 * 1024) return setLocalError('That file is larger than 5 MB. Export a shorter date range.')
              const buf = await f.arrayBuffer()
              let text = new TextDecoder('utf-8').decode(buf)
              if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf) // older German bank exports
              goToMapping(text, f.name)
            }}
          />
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><ClipboardPaste className="h-4 w-4 text-brand-soft" /> Or paste rows</div>
            <textarea
              rows={6}
              className={`${inputClass} py-3 font-mono text-sm`}
              placeholder={'2026-10-01, REWE, -54.20\n2026-10-01, Salary, 4200'}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-label="Paste rows"
            />
            <p className="mt-1 text-xs text-slate-500">Copy rows from Excel, Google Sheets or your bank. One transaction per line.</p>
            <button type="button" className="btn btn-secondary mt-3" disabled={!raw.trim()} onClick={() => goToMapping(raw)}>
              Continue
            </button>
          </div>
          <ErrorNote>{localError}</ErrorNote>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      onClose={onClose}
      size="lg"
      title="Check and import"
      subtitle={fileName || `${body.length} rows pasted`}
      leading={<button type="button" className="icon-btn" aria-label="Back" onClick={() => setStep('source')}><ArrowLeft className="h-5 w-5" /></button>}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            <b className="text-white">{toImport.length}</b> to import
            {dupCount > 0 && <> · {dupCount} {skipDuplicates ? 'duplicates skipped' : 'possible duplicates'}</>}
            {badCount > 0 && <> · {badCount} unreadable</>}
            {body.length > MAX_ROWS && <> · only the first {MAX_ROWS}</>}
          </p>
          <button type="button" className="btn btn-primary" disabled={busy || !toImport.length} onClick={() => void runImport()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {toImport.length || ''} transactions
          </button>
        </div>
      }
    >
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <section>
          <h3 className="mb-3 font-semibold text-white">1. Which column is which?</h3>
          <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
            First row is a header
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {columnSelect('date', 'Date')}
            {columnSelect('amount', 'Amount')}
            {columnSelect('description', 'Description')}
            {columnSelect('category', 'Category (optional)', true)}
            {columnSelect('notes', 'Notes (optional)', true)}
            <Field label="Date format" htmlFor="map-datefmt">
              <select id="map-datefmt" className={selectClass} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="auto">Automatic (day first)</option>
                <option value="dmy">DD.MM.YYYY</option>
                <option value="mdy">MM/DD/YYYY</option>
                <option value="ymd">YYYY-MM-DD</option>
              </select>
            </Field>
          </div>
          <Field label="Amounts" htmlFor="map-sign">
            <select id="map-sign" className={`${selectClass} mt-0`} value={sign} onChange={(e) => setSign(e.target.value as Sign)}>
              <option value="negative-out">Negative = money out (most banks)</option>
              <option value="positive-out">Positive = money out (credit cards)</option>
              <option value="all-out">All are money out</option>
              <option value="all-in">All are money in</option>
            </select>
          </Field>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-white">2. Add context to all rows</h3>
          <p className="mb-3 text-sm text-slate-400">Optional. You can still change single transactions afterwards.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Currency" htmlFor="imp-cur">
              <select id="imp-cur" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Array.from(new Set([currency, ...CURRENCIES])).map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Account" htmlFor="imp-acc">
              <input id="imp-acc" list="imp-accounts" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Sparkasse current" maxLength={80} />
              <datalist id="imp-accounts">{opts.accounts.map((a) => <option key={a} value={a} />)}</datalist>
            </Field>
            <Field label="Default category" htmlFor="imp-cat">
              <select id="imp-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Other</option>
                {[...opts.expenseCategories, ...opts.incomeCategories].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Tags for all" htmlFor="imp-tags">
              <TagInput id="imp-tags" value={tags} onChange={setTags} suggestions={opts.tags} />
            </Field>
            <Field label="Note for all" htmlFor="imp-notes">
              <input id="imp-notes" className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Imported from October statement" maxLength={300} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
            Skip rows already in my Ledger (same date, amount and description)
          </label>
        </section>

        <section>
          <h3 className="mb-3 font-semibold text-white">3. Preview</h3>
          {toImport.length > 0 && (
            <p className="mb-2 text-sm text-slate-400">
              Out {formatMoney(totals.out, currency)} · In {formatMoney(totals.in, currency)}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.slice(0, 50).map((p, i) =>
                  p.ok ? (
                    <tr key={i} className={p.duplicate && skipDuplicates ? 'opacity-45' : ''}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-300">{p.tx.date}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-white">{p.tx.description}</td>
                      <td className="px-3 py-2 text-slate-300">{p.tx.category}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${p.tx.direction === 'in' ? 'text-brand-success' : 'text-white'}`}>{formatMoney(p.tx.amount, p.tx.currency, p.tx.direction)}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{p.duplicate ? 'Duplicate' : 'Ready'}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="text-amber-200/80">
                      <td className="px-3 py-2" colSpan={4}><span className="line-clamp-1">{p.cells.join(' · ')}</span></td>
                      <td className="px-3 py-2 text-xs">{p.reason}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {preview.length > 50 && <p className="mt-2 text-xs text-slate-500">Showing 50 of {preview.length} rows.</p>}
        </section>
        <ErrorNote>{localError || error}</ErrorNote>
      </div>
    </Dialog>
  )
}
