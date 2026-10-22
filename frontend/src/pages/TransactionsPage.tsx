import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, FileUp, Paperclip, Plus, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { TransactionDialog } from '../components/ledger/TransactionDialog'
import { QuickAdd, type QuickDraft } from '../components/ledger/QuickAdd'
import { useIsPhone } from '../hooks/useIsPhone'
import { ImportDialog } from '../components/ledger/ImportDialog'
import { RecentImports } from '../components/ledger/RecentImports'
import { BulkCategoryBar } from '../components/ledger/BulkCategoryBar'
import { TransactionDetails } from '../components/ledger/TransactionDetails'
import { UploadDocumentsDialog } from '../components/ledger/UploadDocumentsDialog'
import { ErrorNote } from '../components/ledger/ui'
import { payeeName } from '../components/overview/RecentTable'
import { PhoneTxRow } from '../components/overview/PhoneTxRow'
import { formatMoney, type Transaction } from '../lib/ledger/types'
import { isTransfer } from '../lib/ledger/categorize'
import { categoryColor, categoryTint } from '../lib/ledger/categoryColors'
import { currenciesByUse, monthName } from '../lib/ledger/summary'

type Open =
  | { kind: 'add'; full?: boolean; draft?: QuickDraft }
  | { kind: 'import'; file?: File }
  | { kind: 'details'; tx: Transaction }
  | { kind: 'edit'; tx: Transaction }
  | { kind: 'attach'; tx: Transaction }
  | null

const PAGE = 25
const PHONE_PAGE = 40
const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const OTHER = /^other( income)?$/i
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const dayYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Period filter: one month ("m:2026-09"), the last three months, this year, or everything. */
function inPeriod(date: string, period: string, latest: string): boolean {
  if (period === 'all') return true
  if (period.startsWith('m:')) return date.startsWith(period.slice(2))
  if (period === 'year') return date.startsWith(latest.slice(0, 4))
  if (period === '3m') {
    const [y, m] = latest.slice(0, 7).split('-').map(Number)
    const from = new Date(y, m - 3, 1)
    return date >= `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`
  }
  return true
}

/** Transactions (design): totals, where the money went, filters, review prompt, the list with selection. */
export function TransactionsPage() {
  const { status, transactions, trash, refresh, busy, error } = useLedger()
  const [open, setOpen] = useState<Open>(null)
  const isPhone = useIsPhone()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState('all')
  const [dir, setDir] = useState<'all' | 'out' | 'in'>('all')
  const [page, setPage] = useState(0)
  const [phoneCount, setPhoneCount] = useState(PHONE_PAGE)

  // "+" and "Upload file" elsewhere link here with ?add=1 / ?import=1: open the dialog, then drop the flag
  useEffect(() => {
    const add = params.get('add') === '1'
    const imp = params.get('import') === '1'
    if (!add && !imp) return
    setOpen(imp ? { kind: 'import' } : { kind: 'add' })
    const next = new URLSearchParams(params)
    next.delete('add')
    next.delete('import')
    setParams(next, { replace: true })
  }, [params, setParams])

  const latest = useMemo(() => transactions.reduce((m, t) => (t.date > m ? t.date : m), ''), [transactions])
  const months = useMemo(() => Array.from(new Set(transactions.map((t) => t.date.slice(0, 7)))).sort().reverse().slice(0, 12), [transactions])
  // A search from elsewhere (?q=) looks at everything; otherwise start with the latest month
  const [period, setPeriod] = useState<string>(() => (params.get('q') ? 'all' : ''))
  const activePeriod = period || (months[0] ? `m:${months[0]}` : 'all')
  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? 'EUR', [transactions])
  const categories = useMemo(() => Array.from(new Set(transactions.map((t) => t.category).filter(Boolean))).sort(), [transactions])

  const inPeriodTx = useMemo(() => transactions.filter((t) => inPeriod(t.date, activePeriod, latest)), [transactions, activePeriod, latest])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inPeriodTx
      .filter((t) => dir === 'all' || t.direction === dir)
      .filter((t) => category === 'all' || t.category === category)
      .filter((t) => !q || [t.description, t.category, t.account, t.notes, t.tags.join(' '), String(t.amount)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [inPeriodTx, query, dir, category])
  useEffect(() => {
    setPage(0)
    setPhoneCount(PHONE_PAGE)
  }, [query, dir, category, activePeriod])

  // Phones (design: MobileTransactions): the list grouped by day, with the money out of what is shown
  const phoneGroups = useMemo(() => {
    const groups: Array<{ date: string; rows: Transaction[]; out: number; inn: number }> = []
    for (const t of filtered.slice(0, phoneCount)) {
      let g = groups.at(-1)
      if (!g || g.date !== t.date) groups.push((g = { date: t.date, rows: [], out: 0, inn: 0 }))
      g.rows.push(t)
      if (t.currency === currency && !isTransfer(t)) {
        if (t.direction === 'out') g.out += t.amount
        else g.inn += t.amount
      }
    }
    return groups
  }, [filtered, phoneCount, currency])
  const shownOut = useMemo(() => {
    const out = filtered.filter((t) => t.direction === 'out' && t.currency === currency && !isTransfer(t))
    return { count: out.length, sum: out.reduce((a, t) => a + t.amount, 0) }
  }, [filtered, currency])
  const reviewing = category !== 'all' && OTHER.test(category)

  const totals = useMemo(() => {
    let inn = 0, out = 0, moved = 0, other = 0
    const byCat = new Map<string, number>()
    for (const t of inPeriodTx) {
      if (t.currency !== currency) continue
      if (isTransfer(t)) {
        if (t.direction === 'out') moved += t.amount
        continue
      }
      if (t.direction === 'in') inn += t.amount
      else {
        out += t.amount
        byCat.set(t.category || 'Other', (byCat.get(t.category || 'Other') ?? 0) + t.amount)
        if (OTHER.test(t.category)) other += t.amount
      }
    }
    return { inn, out, moved, other, byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) }
  }, [inPeriodTx, currency])
  const otherAll = useMemo(() => transactions.filter((t) => OTHER.test(t.category) && !isTransfer(t)), [transactions])

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE)
  const allShownPicked = shown.length > 0 && shown.every((t) => picked.has(t.id))
  const reviewOther = () => {
    setPeriod('all')
    setCategory(otherAll[0]?.category ?? 'Other')
    setDir('all')
    setQuery('')
    setPicked(new Set(otherAll.map((t) => t.id)))
  }

  const ready = status === 'ready'
  const periodLabel = activePeriod.startsWith('m:') ? monthName(activePeriod.slice(2)) : activePeriod === '3m' ? 'Last 3 months' : activePeriod === 'year' ? `This year` : 'All time'
  const range = filtered.length ? `${dayYear(filtered.at(-1)!.date)} – ${dayYear(filtered[0].date)}` : periodLabel
  const accountsInView = Array.from(new Set(inPeriodTx.map((t) => t.account).filter(Boolean)))

  const actions = ready ? (
    <>
      <button type="button" className="icon-btn border border-line-strong md:hidden" aria-label="Import statement" onClick={() => setOpen({ kind: 'import' })}>
        <Upload className="h-5 w-5" aria-hidden />
      </button>
      <Link to="/trash" className="btn btn-ghost max-md:hidden">
        <Trash2 className="h-4 w-4" aria-hidden /> Trash{trash.length > 0 ? ` (${trash.length})` : ''}
      </Link>
      <button type="button" className="btn btn-secondary max-md:hidden" onClick={() => setOpen({ kind: 'import' })}>
        <Upload className="h-4 w-4" aria-hidden /> Import statement
      </button>
      <button type="button" className="btn btn-primary max-md:hidden" onClick={() => setOpen({ kind: 'add' })}>
        <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden /> Add transaction
      </button>
    </>
  ) : undefined

  const left = totals.inn - totals.out
  const flowParts = [...totals.byCat.map(([c, v]) => ({ label: c, value: v, color: categoryColor(c) })), ...(left > 0 ? [{ label: 'Left over', value: left, color: 'var(--color-good)' }] : [])].sort((a, b) => b.value - a.value)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={ready && transactions.length ? `${range}${accountsInView.length === 1 ? ` · ${accountsInView[0]}` : ''}` : undefined}
        title="Transactions"
        actions={actions}
      />

      {!ready ? (
        <div className="card">
          <ConnectDrive context="transactions" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions yet"
            description="Add one by hand with notes and a receipt, or upload a bank statement (CSV, PDF or a photo of one) to add many at once."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setOpen({ kind: 'add' })}><Plus className="h-4 w-4" /> Add transaction</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ kind: 'import' })}><FileUp className="h-4 w-4" /> Import statement</button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <section aria-label="Period totals" className="hidden grid-cols-2 gap-3 md:grid lg:grid-cols-4">
            <div className="card flex flex-col gap-1 rounded-[14px] px-5 py-4">
              <span className="text-slate-400">Transactions</span>
              <span className="font-display text-[28px] leading-tight font-bold text-ink">{inPeriodTx.length}</span>
            </div>
            <div className="card flex flex-col gap-1 rounded-[14px] px-5 py-4">
              <span className="text-slate-400">Money in</span>
              <span className="font-display text-[28px] leading-tight font-bold tabular-nums text-good">+{formatMoney(totals.inn, currency)}</span>
            </div>
            <div className="card flex flex-col gap-1 rounded-[14px] px-5 py-4">
              <span className="text-slate-400">Money out</span>
              <span className="font-display text-[28px] leading-tight font-bold tabular-nums text-ink">−{formatMoney(totals.out, currency)}</span>
              {totals.moved > 0 && <span className="text-xs text-slate-400">plus {formatMoney(totals.moved, currency)} moved between your accounts</span>}
            </div>
            <div className="flex flex-col gap-1 rounded-[14px] border border-warn-line bg-warn-bg px-5 py-4">
              <span className="text-warn-text">Sitting in “Other”</span>
              <span className="font-display text-[28px] leading-tight font-bold tabular-nums text-warn-text">{formatMoney(totals.other, currency)}</span>
            </div>
          </section>

          {totals.inn > 0 && flowParts.length > 0 && (
            <section aria-labelledby="flow-heading" className="card hidden flex-col gap-4 p-6 md:flex">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="flow-heading" className="card-title text-2xl">
                  {activePeriod.startsWith('m:') ? `Where ${monthName(activePeriod.slice(2)).split(' ')[0]}’s ${formatMoney(totals.inn, currency)} went` : `Where the ${formatMoney(totals.inn, currency)} went`}
                </h2>
                <span className="text-slate-400">
                  {left >= 0 ? `${formatMoney(left, currency)} left over` : `${formatMoney(-left, currency)} more out than in`} · {formatMoney(totals.out, currency)} spent
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 rounded-[10px] bg-good px-3.5 py-2.5 font-semibold tabular-nums text-surface">In {formatMoney(totals.inn, currency)}</span>
                <ArrowRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                <div role="img" aria-label={`Split: ${flowParts.map((p) => `${p.label} ${formatMoney(p.value, currency)}`).join(', ')}`} className="flex h-10 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-[10px]">
                  {flowParts.map((p) => <div key={p.label} style={{ flex: p.value, background: p.color }} />)}
                </div>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-2.5">
                {flowParts.map((p) => (
                  <li key={p.label} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: p.color }} aria-hidden />
                    <span className="truncate text-slate-300">{p.label}</span>
                    <span className="ml-auto font-semibold tabular-nums text-ink">{formatMoney(p.value, currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Filters" className="card hidden flex-wrap items-end gap-3 rounded-[14px] p-4 md:flex">
            <label className="flex flex-[2_1_240px] flex-col gap-1.5 text-xs font-semibold text-slate-400">
              Search
              <input type="search" className="field" placeholder="Payee, note or amount" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-xs font-semibold text-slate-400">
              Category
              <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-[1_1_160px] flex-col gap-1.5 text-xs font-semibold text-slate-400">
              Period
              <select className="field" value={activePeriod} onChange={(e) => setPeriod(e.target.value)}>
                {months.map((m) => <option key={m} value={`m:${m}`}>{monthName(m)}</option>)}
                <option value="3m">Last 3 months</option>
                <option value="year">This year</option>
                <option value="all">All time</option>
              </select>
            </label>
            <div className="seg" role="group" aria-label="Direction">
              {(['all', 'in', 'out'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={dir === d} onClick={() => setDir(d)}>{d === 'all' ? 'All' : d === 'in' ? 'In' : 'Out'}</button>
              ))}
            </div>
            <button type="button" className="icon-btn border border-line-strong" aria-label="Reload from Drive" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            </button>
          </section>

          {otherAll.length > 0 && (
            <section aria-label="Needs review" className="card-tint hidden flex-wrap items-center justify-between gap-3 rounded-[14px] px-5 py-4 md:flex">
              <div className="flex items-center gap-3">
                <Sparkles className="h-[22px] w-[22px] shrink-0 text-brand" aria-hidden />
                <p>
                  <b className="text-ink">{otherAll.length} payment{otherAll.length === 1 ? ' is' : 's are'} still in “Other”.</b>{' '}
                  <span className="text-slate-300">Only you know what some of them were. Select them all and give them a category in one go?</span>
                </p>
              </div>
              <button type="button" className="btn bg-panel text-white hover:opacity-90" onClick={reviewOther}>Review {otherAll.length}</button>
            </section>
          )}

          <section aria-label="Filters" className="flex flex-col gap-3 md:hidden">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="sr-only" htmlFor="ph-search">Search</label>
              <input id="ph-search" type="search" className="field" placeholder="Search payee or amount" value={query} onChange={(e) => setQuery(e.target.value)} />
              <select className="field w-[8.5rem]" aria-label="Period" value={activePeriod} onChange={(e) => setPeriod(e.target.value)}>
                {months.map((m) => <option key={m} value={`m:${m}`}>{monthName(m)}</option>)}
                <option value="3m">Last 3 months</option>
                <option value="year">This year</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div role="group" aria-label="Filter" className="flex gap-2 overflow-x-auto">
              {([
                ['All', !reviewing && dir === 'all', () => { setDir('all'); setCategory('all') }],
                ['Out', !reviewing && dir === 'out', () => { setDir('out'); setCategory('all') }],
                ['In', !reviewing && dir === 'in', () => { setDir('in'); setCategory('all') }],
                ...(otherAll.length ? [[`Needs review · ${otherAll.length}`, reviewing, reviewOther] as const] : []),
              ] as const).map(([label, on, pick]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={pick}
                  className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap ${on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {shownOut.count > 0 && (
              <div className="flex justify-between rounded-xl border border-line bg-surface px-3.5 py-3">
                <span className="text-slate-400">{shownOut.count} payment{shownOut.count === 1 ? '' : 's'} out</span>
                <b className="tabular-nums text-ink">−{formatMoney(shownOut.sum, currency)}</b>
              </div>
            )}
          </section>

          <section aria-label="Transactions by day" className="flex flex-col md:hidden">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-slate-400">Nothing matches these filters.</p>
            ) : (
              phoneGroups.map((g) => (
                <div key={g.date} className="flex flex-col">
                  <div className="flex justify-between px-0.5 pt-2.5 pb-1 text-xs font-semibold tracking-[0.04em] text-slate-400 uppercase">
                    <span>{weekday(g.date)}</span>
                    <span className="tabular-nums">{g.out > 0 ? `−${formatMoney(g.out, currency)}` : g.inn > 0 ? `+${formatMoney(g.inn, currency)}` : ''}</span>
                  </div>
                  {g.rows.map((t) => (
                    <PhoneTxRow key={t.id} tx={t} meta="category" border onOpen={() => setOpen({ kind: 'details', tx: t })} />
                  ))}
                </div>
              ))
            )}
            {filtered.length > phoneCount && (
              <button type="button" className="btn btn-secondary mt-3" onClick={() => setPhoneCount((n) => n + PHONE_PAGE)}>
                Show more ({filtered.length - phoneCount} left)
              </button>
            )}
          </section>

          <ErrorNote>{error}</ErrorNote>

          <section aria-label="Transaction list" className="card hidden px-3 pt-2 pb-5 sm:px-5 md:block">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-slate-400">Nothing matches these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.04em] text-slate-500">
                      <th scope="col" className="w-8 border-b border-line px-2 py-3.5">
                        <input
                          type="checkbox"
                          aria-label="Select all on this page"
                          checked={allShownPicked}
                          onChange={() => setPicked((prev) => {
                            const next = new Set(prev)
                            for (const t of shown) (allShownPicked ? next.delete(t.id) : next.add(t.id))
                            return next
                          })}
                          className="h-4 w-4 accent-[var(--color-brand)]"
                        />
                      </th>
                      <th scope="col" className="border-b border-line px-2 py-3.5 font-semibold">Payee</th>
                      <th scope="col" className="hidden border-b border-line px-2 py-3.5 font-semibold md:table-cell">Category</th>
                      <th scope="col" className="hidden border-b border-line px-2 py-3.5 font-semibold sm:table-cell">Date</th>
                      <th scope="col" className="border-b border-line px-2 py-3.5 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => {
                      const other = OTHER.test(t.category)
                      const name = payeeName(t)
                      const note = t.notes || (name !== t.description ? t.description : '') || t.account
                      return (
                        <tr key={t.id} className={`cursor-pointer hover:bg-subtle ${picked.has(t.id) ? 'bg-tint' : other ? 'bg-warn-bg/50' : ''}`} onClick={() => setOpen({ kind: 'details', tx: t })}>
                          <td className="border-b border-row py-3 pr-1 pl-0 sm:px-2" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" aria-label={`Select ${name}`} checked={picked.has(t.id)} onChange={() => togglePick(t.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
                          </td>
                          <td className="border-b border-row px-1 py-3 sm:px-2">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] font-display text-[17px] font-bold text-ink" style={{ background: categoryTint(t.category, 22) }} aria-hidden>
                                {name.charAt(0).toUpperCase()}
                              </span>
                              <span className="flex min-w-0 max-w-[7.5rem] flex-col gap-0.5 min-[420px]:max-w-[11rem] sm:max-w-md">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate font-medium text-ink">{name}</span>
                                  {t.documentIds.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-label="Has documents" />}
                                </span>
                                <span className="truncate text-xs text-slate-500">
                                  <span className="md:hidden">{other ? 'Other · review' : t.category} · </span>
                                  <span className="sm:hidden">{day(t.date)}{note ? ' · ' : ''}</span>
                                  {note}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="hidden border-b border-row px-2 py-3 md:table-cell">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] text-ink" style={{ background: other ? 'var(--color-warn-bg)' : categoryTint(t.category, 20) }}>
                              <span className="h-2 w-2 rounded-full" style={{ background: other ? 'var(--color-spend)' : categoryColor(t.category) }} aria-hidden />
                              {other ? 'Other · review' : t.category}
                            </span>
                          </td>
                          <td className="hidden whitespace-nowrap border-b border-row px-2 py-3 text-slate-400 sm:table-cell">{day(t.date)}</td>
                          <td className={`whitespace-nowrap border-b border-row py-3 pr-0 pl-1 text-right text-sm sm:px-2 font-semibold tabular-nums sm:text-base ${t.direction === 'in' ? 'text-good' : 'text-ink'}`}>
                            {t.direction === 'in' ? '+' : '−'}
                            {formatMoney(t.amount, t.currency)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-4 text-slate-400">
                <span>
                  Showing {page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} of {filtered.length}
                </span>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <button type="button" className="btn btn-secondary" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            )}
          </section>

          <RecentImports />
        </>
      )}

      {ready && transactions.length > 0 && <BulkCategoryBar selected={transactions.filter((t) => picked.has(t.id))} onDone={() => setPicked(new Set())} />}

      {open?.kind === 'add' && isPhone && !open.full && <QuickAdd onClose={() => setOpen(null)} onMore={(draft) => setOpen({ kind: 'add', full: true, draft })} />}
      {open?.kind === 'add' && (!isPhone || open.full) && <TransactionDialog initial={open.draft} onClose={() => setOpen(null)} onImportStatement={(file) => setOpen({ kind: 'import', file })} />}
      {open?.kind === 'edit' && <TransactionDialog existing={open.tx} onClose={() => setOpen(null)} />}
      {open?.kind === 'import' && <ImportDialog initialFile={open.file} onClose={() => setOpen(null)} />}
      {open?.kind === 'attach' && <UploadDocumentsDialog transaction={open.tx} onClose={() => setOpen(null)} />}
      {open?.kind === 'details' && (
        <TransactionDetails
          tx={transactions.find((t) => t.id === open.tx.id) ?? open.tx}
          onClose={() => setOpen(null)}
          onEdit={() => setOpen({ kind: 'edit', tx: transactions.find((t) => t.id === open.tx.id) ?? open.tx })}
          onAttach={() => setOpen({ kind: 'attach', tx: open.tx })}
        />
      )}
    </div>
  )
}
