import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ClipboardPaste, FileUp, Landmark, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions, writeLastEntry } from '../../hooks/useLedgerOptions'
import { analyzeTable, findCsvBalance, parseAmount, parseCsv, readCsvFile, type ColumnMap, type DateFormat } from '../../lib/ledger/csv'
import { TRANSFER_CATEGORY } from '../../lib/ledger/categorize'
import { statementRow, type Sign } from '../../lib/ledger/statement'
import { DEFAULT_MATCH_DAYS, matchToLedger, type LedgerMatch } from '../../lib/ledger/reconcile'
import { isExtractable, parseStatement, parseStatementBalance, readFileText, rowsToCsv, type ExtractProgress, type StatementBalance } from '../../lib/ledger/extract'
import { accountType } from '../../lib/ledger/portfolio'
import { INSTITUTIONS } from '../../lib/ledger/accounts'
import { CURRENCIES, dedupeKey, formatMoney, parseTags, todayIso } from '../../lib/ledger/types'
import { CategorySelect, ErrorNote, Field, TagInput, inputClass, selectClass } from './ui'

const MAX_ROWS = 2000
type Step = 'source' | 'map'

/** Bulk add: CSV from a bank export, a PDF statement or a photo/scan (read on the device), or pasted rows. */
export function ImportDialog({ onClose, initialFile }: { onClose: () => void; initialFile?: File }) {
  const { importTransactions, uploadDocuments, saveAccount, transactions, accounts, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('source')
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [headerRow, setHeaderRow] = useState(0)
  const [firstRow, setFirstRow] = useState(1)
  const [map, setMap] = useState<ColumnMap>({})
  // The bank the user chose, or the one recognised from the file; the user's choice wins
  const [detectedBank, setDetectedBank] = useState<string | undefined>()
  const [pickedBank, setPickedBank] = useState<string | undefined>()
  const bank = pickedBank || detectedBank
  const [otherBank, setOtherBank] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [sign, setSign] = useState<Sign>('negative-out')
  const [currency, setCurrency] = useState(opts.defaultCurrency)
  const [account, setAccount] = useState('')
  /** '' = suggest a category for each row */
  const [category, setCategory] = useState('')
  /** Categories the user picked for single rows in the preview */
  const [overrides, setOverrides] = useState<Map<number, string>>(new Map())
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [matchDays, setMatchDays] = useState(DEFAULT_MATCH_DAYS)
  /** Rows the user chose to import although they match an entry already in the Ledger */
  const [keep, setKeep] = useState<Set<number>>(new Set())
  const [localError, setLocalError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  // The statement file, saved to Documents after the import (CSV, PDF or image)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  // True when rows were read from a PDF or image rather than a CSV
  const [extracted, setExtracted] = useState(false)
  const [saveSource, setSaveSource] = useState(true)
  const [extracting, setExtracting] = useState<ExtractProgress | null>(null)
  const [sourceSaveFailed, setSourceSaveFailed] = useState(false)
  const [skippedMatches, setSkippedMatches] = useState(0)
  /** Closing balance printed on the statement, if any */
  const [foundBalance, setFoundBalance] = useState<StatementBalance | undefined>()
  /** Balance as on a date: the starting point for the account's value (typed when the statement shows none) */
  const [balanceText, setBalanceText] = useState('')
  const [balanceDate, setBalanceDate] = useState('')
  /** Portfolio account to update: an account id, 'new', or '' for none; null = follow the Account field */
  const [balanceTarget, setBalanceTarget] = useState<string | null>(null)
  const [balanceResult, setBalanceResult] = useState<{ name: string; text: string } | 'failed' | null>(null)

  const table = useMemo(() => (raw.trim() ? parseCsv(raw) : []), [raw])
  const header = headerRow >= 0 ? table[headerRow] ?? [] : []
  const body = table.slice(firstRow)
  const width = Math.max(0, ...table.slice(Math.max(0, headerRow)).map((r) => r.length))
  const columnNames = Array.from({ length: width }, (_, i) => (header[i] ? `${header[i]}` : `Column ${i + 1}`))

  const editRaw = (text: string) => {
    setRaw(text)
    setKeep(new Set())
    setOverrides(new Map())
  }

  const goToMapping = (text: string, name = '', statementBalance?: StatementBalance) => {
    editRaw(text)
    setFileName(name)
    const t = parseCsv(text)
    if (t.length < 1) {
      setLocalError('No rows found. Check the file or the pasted text.')
      return
    }
    const a = analyzeTable(t)
    setHeaderRow(a.headerRow)
    setFirstRow(a.firstRow)
    setMap(a.map)
    setDetectedBank(a.bank)
    if (a.currency) setCurrency(a.currency)
    const found = statementBalance ?? findCsvBalance(t, a)
    setFoundBalance(found)
    setBalanceText(found ? found.balance.toFixed(2) : '')
    setBalanceDate(found?.date ?? '')
    // Banks that list money out as positive numbers in a single column are rare; credit cards are the usual case
    setSign('negative-out')
    setShowMapping(a.map.date === undefined || a.map.amount === undefined || a.map.description === undefined)
    setLocalError(null)
    setStep('map')
  }

  const loadFile = async (f: File) => {
    setLocalError(null)
    if (isExtractable(f)) {
      if (f.size > 15 * 1024 * 1024) return setLocalError('That file is larger than 15 MB.')
      setExtracting({ status: 'Starting' })
      try {
        const { lines } = await readFileText(f, setExtracting)
        const rows = parseStatement(lines)
        if (!rows.length) return setLocalError('No transactions found in that file. Rows need a date and an amount. For photos, try a sharper, well-lit picture, or use your bank’s CSV export.')
        setSourceFile(f)
        setExtracted(true)
        goToMapping(rowsToCsv(rows), f.name, parseStatementBalance(lines))
      } catch (err) {
        setLocalError((err as Error)?.message || 'That file could not be read.')
      } finally {
        setExtracting(null)
      }
      return
    }
    if (f.size > 5 * 1024 * 1024) return setLocalError('That file is larger than 5 MB. Export a shorter date range.')
    setSourceFile(f)
    setExtracted(false)
    goToMapping(await readCsvFile(f), f.name)
  }

  // A statement handed over from the Add transaction dialog
  const started = useRef(false)
  useEffect(() => {
    if (!initialFile || started.current) return
    started.current = true
    void loadFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  const parsed = useMemo(() => {
    const knownCategories = [...opts.expenseCategories, ...opts.incomeCategories]
    return body.slice(0, MAX_ROWS).map((r, i) =>
      statementRow(r, map, { dateFormat, sign, currency, account, category: overrides.get(i) || category, tags, notes, learned: opts.learned, knownCategories }),
    )
  }, [body, map, dateFormat, sign, currency, account, category, overrides, tags, notes, opts])

  // Rows already in the Ledger: exact copies, or the user's own entry for the same payment
  const matches = useMemo(() => matchToLedger(parsed.map((p) => (p.ok ? p.tx : null)), transactions, matchDays), [parsed, transactions, matchDays])

  const preview = useMemo(() => {
    const seen = new Set<string>()
    return parsed.map((p, i) => {
      if (!p.ok) return { ...p, i }
      const match: LedgerMatch | undefined = matches[i]
      const key = dedupeKey(p.tx)
      // The same row twice in this file (only when it isn't already matched to the Ledger)
      const inFileDuplicate = !match && seen.has(key)
      seen.add(key)
      const skipped = skipDuplicates && (inFileDuplicate || (!!match && !keep.has(i)))
      return { ...p, i, match, inFileDuplicate, skipped }
    })
  }, [parsed, matches, skipDuplicates, keep])

  const valid = preview.filter((p) => p.ok)
  const toImport = valid.filter((p) => !p.skipped)
  const matched = valid.filter((p) => p.match)
  const dupCount = valid.filter((p) => p.inFileDuplicate).length
  const badCount = preview.length - valid.length
  const suggestedCount = toImport.filter((p) => p.suggested).length
  const totals = toImport.reduce(
    (acc, p) => {
      if (p.tx.category === TRANSFER_CATEGORY) acc.transfer += p.tx.amount
      else if (p.tx.direction === 'out') acc.out += p.tx.amount
      else acc.in += p.tx.amount
      return acc
    },
    { out: 0, in: 0, transfer: 0 },
  )

  // Balance as on date → the matching account on the Accounts page
  const lastTxDate = toImport.reduce((d, p) => (p.tx.date > d ? p.tx.date : d), '')
  const asOf = balanceDate || lastTxDate || todayIso()
  const balanceAccounts = accounts.filter((a) => accountType(a.type).group !== 'cover')
  const byName = balanceAccounts.find((a) => a.name.trim().toLowerCase() === account.trim().toLowerCase())
  const target = balanceTarget ?? (byName ? byName.id : account.trim() ? 'new' : '')
  const targetAccount = balanceAccounts.find((a) => a.id === target)
  const newAccountName = account.trim() || (bank ? `${bank} account` : 'Bank account')
  const newAccountType = sign === 'positive-out' ? 'credit_card' : 'current'
  const isDebt = accountType(targetAccount?.type ?? newAccountType).group === 'debt'
  const balanceValue = balanceText.trim() ? parseAmount(balanceText) : null
  const balanceNote = (() => {
    if (!balanceText.trim() || !target) return null
    if (balanceValue === null) return 'Enter the balance as a number, for example 1234.56.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return 'Choose the date of this balance.'
    if (balanceValue < 0 && !isDebt) return 'A negative balance (overdraft) can’t be kept on a current or savings account yet, so it will not be updated.'
    if (targetAccount && targetAccount.asOf > asOf) return `${targetAccount.name} already has a newer balance (${formatMoney(targetAccount.balance, targetAccount.currency)} on ${targetAccount.asOf}), so that one is kept.`
    return null
  })()
  const balanceToSave = balanceValue !== null && target && !balanceNote ? Math.round(Math.abs(balanceValue) * 100) / 100 : null

  const runImport = async () => {
    if (!toImport.length) return
    try {
      const n = await importTransactions(toImport.map((p) => p.tx))
      if (balanceToSave !== null) {
        // The transactions are already saved; a failed balance update is reported, not thrown
        const saved = await saveAccount(
          targetAccount
            ? { ...targetAccount, balance: balanceToSave, asOf }
            : {
                name: newAccountName.slice(0, 80),
                type: newAccountType,
                institution: bank ?? '',
                currency,
                balance: balanceToSave,
                asOf,
                rate: null,
                monthly: 0,
                notes: 'Created from a statement import',
              },
          targetAccount,
        ).catch(() => null)
        setBalanceResult(saved ? { name: saved.name, text: `${formatMoney(saved.balance, saved.currency)} on ${saved.asOf}` } : 'failed')
      }
      setSkippedMatches(matched.filter((p) => p.skipped).length)
      writeLastEntry({ currency, account: account.trim() || undefined })
      if (sourceFile && saveSource) {
        const dates = toImport.map((p) => p.tx.date).sort()
        // The transactions are already saved; a failed upload must not look like a failed import
        await uploadDocuments([
          {
            file: sourceFile,
            title: sourceFile.name.replace(/\.[^.]+$/, ''),
            type: 'Bank statement',
            date: dates[dates.length - 1] ?? todayIso(),
            notes: `${n} transactions imported${dates.length ? ` (${dates[0]} to ${dates[dates.length - 1]})` : ''}`,
            tags: parseTags(tags),
          },
        ]).catch(() => setSourceSaveFailed(true))
      }
      setDone(n)
    } catch {
      /* shown from context */
    }
  }

  const columnSelect = (key: keyof ColumnMap, label: string, optional = false) => (
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
  const colName = (i: number | undefined) => (i !== undefined ? columnNames[i] : undefined)

  if (done !== null) {
    return (
      <Dialog onClose={onClose} title="Import complete" fitContent footer={<div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>}>
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-success/15 text-brand-success">
            <Check className="h-6 w-6" />
          </div>
          <p className="text-xl font-semibold text-white">{done} transactions added</p>
          <p className="mt-1 text-sm text-slate-400">They are in the Transactions tab of your Ledger. You can add notes or tags to any of them.</p>
          {skippedMatches > 0 && <p className="mt-2 text-sm text-slate-400">{skippedMatches} {skippedMatches === 1 ? 'payment was' : 'payments were'} already in your Ledger and kept as you entered them.</p>}
          {balanceResult && balanceResult !== 'failed' && <p className="mt-2 text-sm text-slate-400">Balance of {balanceResult.name} set to {balanceResult.text}.</p>}
          {balanceResult === 'failed' && <p className="mt-3 text-sm text-amber-200/90">The balance could not be saved. You can update it on the Accounts page.</p>}
          {sourceSaveFailed && <p className="mt-3 text-sm text-amber-200/90">The statement file could not be saved to Documents. You can upload it from the Documents page.</p>}
        </div>
      </Dialog>
    )
  }

  if (step === 'source') {
    return (
      <Dialog onClose={onClose} title="Import transactions" subtitle="From a bank export (CSV), a PDF statement or pasted rows" fitContent>
        <div className="space-y-5 px-4 py-5 sm:px-6">
          <div>
            <label htmlFor="imp-bank" className="mb-1.5 block text-sm font-medium text-slate-300">Which bank is this statement from?</label>
            <select
              id="imp-bank"
              className={selectClass}
              value={otherBank ? '__other__' : pickedBank ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setOtherBank(v === '__other__')
                setPickedBank(v === '__other__' || v === '' ? undefined : v)
              }}
            >
              <option value="">Detect from the file</option>
              {INSTITUTIONS.map((b) => <option key={b}>{b}</option>)}
              <option value="__other__">Another bank…</option>
            </select>
            {otherBank && (
              <input className={`${inputClass} mt-2`} placeholder="Bank name" maxLength={80} value={pickedBank ?? ''} onChange={(e) => setPickedBank(e.target.value.trim() || undefined)} aria-label="Bank name" />
            )}
            <p className="mt-1.5 text-xs text-slate-500">Used to name the account. PDFs and photos don't show their bank, so choose it here.</p>
          </div>
          <button type="button" disabled={!!extracting} onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-4 rounded-2xl border border-line-strong p-4 text-left hover:border-brand-soft/50">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-soft"><FileUp className="h-5 w-5" /></span>
            <span>
              <span className="block font-semibold text-white">Upload a statement</span>
              <span className="block text-sm text-slate-400">The CSV export from your bank (Commerzbank, Sparkasse, DKB, ING, N26, HDFC …), a PDF statement, or a photo of one.</span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain,.txt,.tsv,.pdf,application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void loadFile(f)
            }}
          />
          {extracting ? (
            <div role="status" className="rounded-xl border border-line p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-brand-soft" /> {extracting.status}{extracting.progress !== undefined && ` · ${Math.round(extracting.progress * 100)}%`}</div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Read on this device. The file is not sent anywhere.</p>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> Files are read on this device. Nothing is sent to our servers.</p>
          )}
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
            <button type="button" className="btn btn-secondary mt-3" disabled={!raw.trim() || !!extracting} onClick={() => {
              setSourceFile(null)
              setExtracted(false)
              goToMapping(raw)
            }}>
              Continue
            </button>
          </div>
          <ErrorNote>{localError}</ErrorNote>
        </div>
      </Dialog>
    )
  }

  const detected = [
    ['Date', colName(map.date)],
    [map.credit !== undefined ? 'Money out' : 'Amount', colName(map.amount)],
    ['Money in', colName(map.credit)],
    ['Payee', colName(map.payee)],
    ['Description', colName(map.description)],
    ['Currency', colName(map.currency)],
  ].filter((x): x is [string, string] => !!x[1])

  return (
    <Dialog
      onClose={onClose}
      size="lg"
      title="Check and import"
      subtitle={`${bank ? `${bank} export · ` : ''}${fileName || `${body.length} rows pasted`}`}
      leading={<button type="button" className="icon-btn" aria-label="Back" onClick={() => setStep('source')}><ArrowLeft className="h-5 w-5" /></button>}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            <b className="text-white">{toImport.length}</b> to import
            {matched.length > 0 && <> · {matched.length} already in your Ledger</>}
            {dupCount > 0 && <> · {dupCount} {skipDuplicates ? 'repeated rows skipped' : 'repeated rows'}</>}
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
          {!showMapping ? (
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-white">
                <Sparkles className="h-4 w-4 text-brand-soft" /> {bank ? `Recognised a ${bank} export` : 'Columns recognised'}
              </p>
              <p className="mt-1 text-slate-400">{detected.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
              <button type="button" className="mt-2 text-sm font-medium text-brand-soft hover:underline" onClick={() => setShowMapping(true)}>Change columns</button>
            </div>
          ) : (
            <>
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={headerRow >= 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setHeaderRow(firstRow)
                      setFirstRow(firstRow + 1)
                    } else {
                      setFirstRow(headerRow)
                      setHeaderRow(-1)
                    }
                  }}
                  className="h-4 w-4 accent-[var(--color-brand)]"
                />
                {headerRow > 0 ? `Row ${headerRow + 1} is the header (${headerRow} summary lines above it are skipped)` : 'First row is a header'}
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {columnSelect('date', 'Date')}
                {columnSelect('amount', map.credit !== undefined ? 'Money out column' : 'Amount')}
                {columnSelect('credit', 'Money in column (if separate)', true)}
                {columnSelect('description', 'Description')}
                {columnSelect('payee', 'Payee / name (optional)', true)}
                {columnSelect('category', 'Category (optional)', true)}
                {columnSelect('currency', 'Currency (optional)', true)}
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
            </>
          )}
          {map.credit === undefined && (
            <div className="mt-3">
              <Field label="Amounts" htmlFor="map-sign">
                <select id="map-sign" className={selectClass} value={sign} onChange={(e) => setSign(e.target.value as Sign)}>
                  <option value="negative-out">Negative = money out (bank accounts)</option>
                  <option value="positive-out">Positive = money out (credit cards)</option>
                  <option value="all-out">All are money out</option>
                  <option value="all-in">All are money in</option>
                </select>
              </Field>
            </div>
          )}
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
              <input id="imp-acc" list="imp-accounts" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} placeholder={bank ? `e.g. ${bank} current` : 'e.g. Sparkasse current'} maxLength={80} />
              <datalist id="imp-accounts">{opts.accounts.map((a) => <option key={a} value={a} />)}</datalist>
            </Field>
            <Field label="Category" htmlFor="imp-cat">
              <CategorySelect
                id="imp-cat"
                value={category}
                onChange={(c) => {
                  setCategory(c)
                  setOverrides(new Map())
                }}
                expense={opts.expenseCategories}
                income={opts.incomeCategories}
                empty="Automatic (suggested per row)"
                transfer
              />
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
            Skip payments I already added myself
          </label>
          {skipDuplicates && (
            <p className="ml-6 mt-1 text-xs text-slate-500">
              Same amount and money in/out, dated within{' '}
              <select aria-label="Days apart" className="rounded border border-line-strong bg-transparent px-1 text-slate-300" value={matchDays} onChange={(e) => setMatchDays(Number(e.target.value))}>
                {[0, 1, 2, 4, 7, 10].map((d) => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
              </select>{' '}
              days. Your own entry is kept with its notes, tags and receipts.
            </p>
          )}
          {sourceFile && (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={saveSource} onChange={(e) => setSaveSource(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Also save {sourceFile.name} to my Documents as a bank statement
            </label>
          )}
        </section>

        <section>
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-white"><Landmark className="h-4 w-4 text-brand-soft" /> Balance as on date</h3>
          <p className="mb-3 text-sm text-slate-400">
            {foundBalance
              ? `Found on the statement${foundBalance.date ? ` for ${foundBalance.date}` : ''}. It becomes the account’s balance, the starting point for net worth and forecasts.`
              : 'The statement doesn’t show a total balance. Optional: enter what the account held on a date (for example from your banking app) to use it as the starting point for net worth and forecasts.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={isDebt ? 'Amount owed' : 'Balance'} htmlFor="imp-bal">
              <input id="imp-bal" inputMode="decimal" className={inputClass} value={balanceText} onChange={(e) => setBalanceText(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="As on" htmlFor="imp-bal-date">
              <input id="imp-bal-date" type="date" className={inputClass} value={asOf} onChange={(e) => setBalanceDate(e.target.value)} />
            </Field>
            <Field label="Update account" htmlFor="imp-bal-acc">
              <select id="imp-bal-acc" className={selectClass} value={target} onChange={(e) => setBalanceTarget(e.target.value)}>
                <option value="">Don’t update an account</option>
                {balanceAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {formatMoney(a.balance, a.currency)}</option>)}
                <option value="new">New account “{newAccountName}”</option>
              </select>
            </Field>
          </div>
          {balanceNote && <p className="mt-2 text-xs text-amber-200/90">{balanceNote}</p>}
        </section>

        {extracted && sourceFile && (
          <section>
            <h3 className="mb-1 font-semibold text-white">Rows read from {sourceFile.name}</h3>
            <p className="mb-3 text-sm text-slate-400">Read on this device. Check them against the statement and fix any mistakes here; the preview updates as you type.</p>
            <textarea rows={8} className={`${inputClass} py-3 font-mono text-xs`} value={raw} onChange={(e) => editRaw(e.target.value)} aria-label="Extracted rows" spellCheck={false} />
          </section>
        )}

        {skipDuplicates && matched.length > 0 && (
          <section>
            <h3 className="mb-1 font-semibold text-white">Already in your Ledger ({matched.length})</h3>
            <p className="mb-3 text-sm text-slate-400">These look like payments you added yourself, so they will be skipped. Tick “Import anyway” if one is a different payment.</p>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {matched.slice(0, 200).map((p) => (
                <li key={p.i} className={`grid gap-2 px-3 py-2.5 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center ${keep.has(p.i) ? '' : 'opacity-80'}`}>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">Statement · {p.tx.date}</div>
                    <div className="truncate text-white">{p.tx.description}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">
                      Your entry · {p.match!.tx.date}
                      {p.match!.kind === 'exact' ? ' · identical' : p.match!.days > 0 ? ` · ${p.match!.days} day${p.match!.days > 1 ? 's' : ''} apart` : ''}
                    </div>
                    <div className="truncate text-slate-200">{p.match!.tx.description}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className={`whitespace-nowrap font-medium ${p.tx.direction === 'in' ? 'text-brand-success' : 'text-white'}`}>{formatMoney(p.tx.amount, p.tx.currency, p.tx.direction)}</span>
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-brand)]"
                        checked={keep.has(p.i)}
                        onChange={(e) =>
                          setKeep((k) => {
                            const next = new Set(k)
                            if (e.target.checked) next.add(p.i)
                            else next.delete(p.i)
                            return next
                          })
                        }
                      />
                      Import anyway
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            {matched.length > 200 && <p className="mt-2 text-xs text-slate-500">Showing 200 of {matched.length}.</p>}
          </section>
        )}

        <section>
          <h3 className="mb-1 font-semibold text-white">3. Preview</h3>
          {toImport.length > 0 && (
            <p className="mb-2 text-sm text-slate-400">
              Out {formatMoney(totals.out, currency)} · In {formatMoney(totals.in, currency)}
              {totals.transfer > 0 && <> · Transfers {formatMoney(totals.transfer, currency)}</>}
              {!category && suggestedCount > 0 && <> · {suggestedCount} categorised automatically</>}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.slice(0, 100).map((p) =>
                  p.ok ? (
                    <tr key={p.i} className={p.skipped ? 'opacity-45' : ''}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-300">{p.tx.date}</td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-white" title={p.tx.description}>{p.tx.description}</td>
                      <td className="px-2 py-1">
                        <CategorySelect
                          value={p.tx.category}
                          onChange={(c) =>
                            setOverrides((o) => {
                              const next = new Map(o)
                              if (c) next.set(p.i, c)
                              else next.delete(p.i)
                              return next
                            })
                          }
                          expense={opts.expenseCategories}
                          income={opts.incomeCategories}
                          empty="Automatic"
                          transfer
                          className="min-h-9 w-full min-w-[150px] rounded-lg border border-transparent bg-transparent px-1 text-sm text-slate-200 hover:border-line-strong focus:border-brand-soft/60 focus:outline-none"
                        />
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${p.tx.direction === 'in' ? 'text-brand-success' : 'text-white'}`}>{formatMoney(p.tx.amount, p.tx.currency, p.tx.direction)}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{p.match ? (p.skipped ? 'Already added' : 'Import anyway') : p.inFileDuplicate ? 'Repeated row' : 'Ready'}</td>
                    </tr>
                  ) : (
                    <tr key={p.i} className="text-amber-200/80">
                      <td className="px-3 py-2" colSpan={4}><span className="line-clamp-1">{p.cells.join(' · ')}</span></td>
                      <td className="px-3 py-2 text-xs">{p.reason}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {preview.length > 100 && <p className="mt-2 text-xs text-slate-500">Showing 100 of {preview.length} rows. Change categories for the rest after importing.</p>}
        </section>
        <ErrorNote>{localError || error}</ErrorNote>
      </div>
    </Dialog>
  )
}
