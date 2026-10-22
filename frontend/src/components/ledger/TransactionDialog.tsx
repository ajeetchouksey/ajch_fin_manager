import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Loader2, ScanText, ShieldCheck, Sparkles } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions, readLastEntry, writeLastEntry } from '../../hooks/useLedgerOptions'
import { EXTRACTABLE_ACCEPT, parseReceipt, readFileText, type ExtractProgress } from '../../lib/ledger/extract'
import { isCsvFile, looksLikeStatement, readCsvFile } from '../../lib/ledger/csv'
import { TRANSFER_CATEGORY, suggestCategory } from '../../lib/ledger/categorize'
import { CURRENCIES, DOCUMENT_TYPES, parseTags, todayIso, type Direction, type Transaction } from '../../lib/ledger/types'
import { CategorySelect, ErrorNote, Field, FilePicker, TagInput, inputClass, selectClass } from './ui'
import { parseNumber } from '../../lib/ledger/money'

type Kind = Direction | 'transfer'

/**
 * Add a single transaction (with notes, tags and attachments) or edit an existing one.
 * A transfer between the user's own accounts is saved as two rows (out of one, into the other)
 * with the Transfer category, which the Overview leaves out of income and spending.
 */
export function TransactionDialog({
  onClose,
  existing,
  onImportStatement,
}: {
  onClose: () => void
  existing?: Transaction
  /** Opens the import flow for a bank statement the user attached here */
  onImportStatement?: (file: File) => void
}) {
  const { addTransaction, updateTransaction, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const last = readLastEntry()

  const [direction, setDirection] = useState<Direction>(existing?.direction ?? 'out')
  const [kind, setKind] = useState<Kind>(existing?.category === TRANSFER_CATEGORY ? 'transfer' : existing?.direction ?? 'out')
  const [date, setDate] = useState(existing?.date ?? todayIso())
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? opts.defaultCurrency)
  const [account, setAccount] = useState(existing?.account ?? last.account ?? '')
  const [toAccount, setToAccount] = useState('')
  const [category, setCategory] = useState(existing?.category ?? last.categoryOut ?? '')
  // Once the user picks a category we stop suggesting one
  const [categoryTouched, setCategoryTouched] = useState(!!existing)
  // Once the user picks money in or out, suggestions keep to that direction
  const [kindTouched, setKindTouched] = useState(!!existing)
  const [suggestedFrom, setSuggestedFrom] = useState<string | null>(null)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [docType, setDocType] = useState('Receipt')
  const [statement, setStatement] = useState<{ file: File; rows: number; bank?: string } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const receiptRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState<ExtractProgress | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  // Suggest a category (and money in/out) from the description: "October salary" → Salary, Money in
  useEffect(() => {
    if (categoryTouched || kind === 'transfer') return
    const t = window.setTimeout(() => {
      const own = { ownNames: opts.ownNames }
      const hit = suggestCategory(description, direction, opts.learned, own) ?? (kindTouched ? null : suggestCategory(description, undefined, opts.learned, own))
      if (!hit || hit.category === TRANSFER_CATEGORY) {
        setSuggestedFrom(null)
        return
      }
      const dir = hit.direction ?? direction
      setDirection(dir)
      setKind(dir)
      setCategory(hit.category)
      setSuggestedFrom(hit.source === 'history' ? 'your earlier entries' : 'the description')
    }, 250)
    return () => window.clearTimeout(t)
  }, [description, direction, kind, categoryTouched, kindTouched, opts.learned, opts.ownNames])

  // A CSV attached here is usually a bank statement: offer to import its rows instead
  useEffect(() => {
    let alive = true
    const csv = files.find(isCsvFile)
    if (!csv) return
    readCsvFile(csv)
      .then((text) => {
        const found = looksLikeStatement(text)
        if (alive) setStatement(found ? { file: csv, ...found } : null)
      })
      .catch(() => alive && setStatement(null))
    return () => {
      alive = false
    }
  }, [files])

  const chooseKind = (k: Kind) => {
    setKind(k)
    setKindTouched(true)
    setSuggestedFrom(null)
    if (k === 'transfer') {
      setDirection('out')
      setCategory(TRANSFER_CATEGORY)
      return
    }
    setDirection(k)
    const fits = (k === 'out' ? opts.expenseCategories : opts.incomeCategories).includes(category)
    if (!fits) {
      setCategory('')
      setCategoryTouched(false)
    }
  }

  /** Picking an income category switches to Money in, and the other way round. */
  const chooseCategory = (c: string) => {
    setCategory(c)
    setCategoryTouched(!!c)
    setSuggestedFrom(null)
    if (opts.incomeCategories.includes(c) && !opts.expenseCategories.includes(c)) {
      setDirection('in')
      setKind('in')
    } else if (opts.expenseCategories.includes(c) && !opts.incomeCategories.includes(c)) {
      setDirection('out')
      setKind('out')
    }
  }

  /** Reads a receipt or invoice on this device, pre-fills the form and attaches the file. */
  const fillFromReceipt = async (file: File) => {
    setLocalError(null)
    setScanNote(null)
    if (isCsvFile(file)) {
      // A CSV is a statement, not a receipt: attaching it shows the import offer
      setFiles((fs) => (fs.includes(file) ? fs : [...fs, file]))
      return
    }
    if (file.size > 15 * 1024 * 1024) return setLocalError('That file is larger than 15 MB.')
    setScanning({ status: 'Starting' })
    try {
      const { lines } = await readFileText(file, setScanning)
      const r = parseReceipt(lines)
      const found: string[] = []
      setDirection('out')
      setKind('out')
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

  // Only while that file is still attached
  const shownStatement = statement && files.includes(statement.file) ? statement : null
  const currencies = Array.from(new Set([currency, opts.defaultCurrency, ...CURRENCIES].filter(Boolean)))
  const isTransfer = kind === 'transfer'
  const newTransfer = isTransfer && !existing

  const submit = async () => {
    setLocalError(null)
    const value = parseNumber(amount) ?? NaN
    if (!Number.isFinite(value) || value <= 0) return setLocalError('Enter an amount greater than 0.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setLocalError('Choose a date.')
    const from = account.trim()
    const to = toAccount.trim()
    if (newTransfer) {
      if (!from || !to) return setLocalError('Choose the account the money left and the account it went to.')
      if (from.toLowerCase() === to.toLowerCase()) return setLocalError('Pick two different accounts.')
    } else if (!description.trim()) return setLocalError('Add a short description, for example the shop or who paid you.')
    const fields = {
      date,
      direction,
      amount: Math.round(value * 100) / 100,
      currency,
      account: from,
      category: isTransfer ? TRANSFER_CATEGORY : category || (direction === 'out' ? 'Other' : 'Other income'),
      description: description.trim().slice(0, 200),
      notes: notes.trim().slice(0, 2000),
      tags: parseTags(tags),
    }
    const attachments = files.map((file) => ({ file, title: file.name.replace(/\.[^.]+$/, ''), type: docType, date, notes: '', tags: fields.tags }))
    try {
      if (existing) {
        await updateTransaction({ ...existing, ...fields })
      } else if (newTransfer) {
        await addTransaction({ ...fields, direction: 'out', description: fields.description || `Transfer to ${to}` }, attachments)
        await addTransaction({ ...fields, direction: 'in', account: to, description: fields.description || `Transfer from ${from}` }, [])
      } else {
        await addTransaction(fields, attachments)
      }
      const remembered = kind === 'transfer' ? {} : direction === 'in' ? { categoryIn: category } : { categoryOut: category }
      writeLastEntry({ ...last, currency, account: from || undefined, ...remembered })
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
            {busy ? (files.length ? 'Uploading…' : 'Saving…') : existing ? 'Save changes' : newTransfer ? 'Add transfer' : 'Add transaction'}
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
              {scanning ? `${scanning.status}${scanning.progress !== undefined ? ` · ${Math.round(scanning.progress * 100)}%` : ''}` : 'Fill from a receipt, invoice or statement'}
            </button>
            <input
              ref={receiptRef}
              type="file"
              accept={`${EXTRACTABLE_ACCEPT},.csv,text/csv`}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void fillFromReceipt(f)
              }}
            />
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" /> {scanNote ?? 'Photo, PDF or bank CSV. Read on this device; nothing is sent to our servers.'}
            </p>
          </div>
        )}

        <div>
          <div role="radiogroup" aria-label="Type of transaction" className="grid grid-cols-3 gap-1 rounded-xl border border-line-strong p-1">
            {(['out', 'in', 'transfer'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                // An existing row can switch between in and out, but not become half of a transfer
                disabled={!!existing && (k === 'transfer') !== isTransfer}
                onClick={() => chooseKind(k)}
                className={`min-h-10 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 ${kind === k ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {k === 'out' ? 'Money out' : k === 'in' ? 'Money in' : 'Transfer'}
              </button>
            ))}
          </div>
          {isTransfer && <p className="mt-1.5 text-xs text-slate-500">Between your own accounts, for example current account to savings. Not counted as income or spending.</p>}
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

        <div className={`grid gap-4 ${isTransfer ? '' : 'sm:grid-cols-2'}`}>
          <Field label="Date" htmlFor="tx-date">
            <input id="tx-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {!isTransfer && (
            <Field
              label="Category"
              htmlFor="tx-category"
              hint={suggestedFrom ? <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-brand-soft" /> Suggested from {suggestedFrom}</span> : undefined}
            >
              <CategorySelect id="tx-category" value={category} onChange={chooseCategory} expense={opts.expenseCategories} income={opts.incomeCategories} />
            </Field>
          )}
        </div>

        <Field
          label={isTransfer ? 'Description (optional)' : 'Description'}
          htmlFor="tx-desc"
          hint={isTransfer ? 'For example: monthly savings' : direction === 'out' ? 'Shop, payee or what it was for' : 'Who paid you, or what for'}
        >
          <input id="tx-desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder={isTransfer ? 'e.g. Move to Tagesgeld' : direction === 'out' ? 'e.g. REWE weekly shop' : 'e.g. October salary'} />
        </Field>

        <div className={newTransfer ? 'grid gap-4 sm:grid-cols-2' : ''}>
          <Field label={newTransfer ? 'From account' : 'Account'} htmlFor="tx-account" hint={newTransfer ? undefined : 'Optional. Type a name like “Sparkasse current” or pick one.'}>
            <input id="tx-account" list="tx-accounts" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} maxLength={80} placeholder="e.g. Current account" />
          </Field>
          {newTransfer && (
            <Field label="To account" htmlFor="tx-to-account">
              <input id="tx-to-account" list="tx-accounts" className={inputClass} value={toAccount} onChange={(e) => setToAccount(e.target.value)} maxLength={80} placeholder="e.g. Savings account" />
            </Field>
          )}
          <datalist id="tx-accounts">
            {opts.accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>

        <Field label="Notes" htmlFor="tx-notes" hint="Any context you want to remember: why, who with, warranty, split with someone…">
          <textarea id="tx-notes" rows={3} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>

        <Field label="Tags" htmlFor="tx-tags" hint="Separate with commas">
          <TagInput id="tx-tags" value={tags} onChange={setTags} suggestions={opts.tags.length ? opts.tags : ['tax-deductible', 'recurring', 'reimbursable']} />
        </Field>

        {!existing && (
          <div className="space-y-3">
            <FilePicker files={files} onChange={setFiles} />
            {shownStatement && (
              <div role="status" className="rounded-xl border border-brand-soft/40 bg-brand/10 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-white">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand-soft" />
                  This is a {shownStatement.bank ? `${shownStatement.bank} ` : ''}bank statement with {shownStatement.rows} transactions
                </p>
                <p className="mt-1 text-slate-400">Import them all at once, each with its own category, instead of attaching the file to a single transaction.</p>
                {onImportStatement && (
                  <button type="button" className="btn btn-primary mt-3" onClick={() => onImportStatement(shownStatement.file)}>
                    Import {shownStatement.rows} transactions
                  </button>
                )}
              </div>
            )}
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
