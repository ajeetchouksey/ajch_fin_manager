import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileUp, Paperclip, Plus, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { TransactionDialog } from '../components/ledger/TransactionDialog'
import { ImportDialog } from '../components/ledger/ImportDialog'
import { TransactionDetails } from '../components/ledger/TransactionDetails'
import { UploadDocumentsDialog } from '../components/ledger/UploadDocumentsDialog'
import { ErrorNote, TagChips, inputClass } from '../components/ledger/ui'
import { formatMoney, type Transaction } from '../lib/ledger/types'
import { isTransfer } from '../lib/ledger/categorize'

type Open =
  | { kind: 'add' }
  | { kind: 'import'; file?: File }
  | { kind: 'details'; tx: Transaction }
  | { kind: 'edit'; tx: Transaction }
  | { kind: 'attach'; tx: Transaction }
  | null

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym || 'No date'
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function TransactionsPage() {
  const { status, transactions, refresh, busy, error } = useLedger()
  const [open, setOpen] = useState<Open>(null)
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [dir, setDir] = useState<'all' | 'out' | 'in'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...transactions]
      .filter((t) => dir === 'all' || t.direction === dir)
      .filter((t) => !q || [t.description, t.category, t.account, t.notes, t.tags.join(' ')].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [transactions, query, dir])

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filtered) {
      const k = t.date.slice(0, 7)
      map.set(k, [...(map.get(k) ?? []), t])
    }
    return Array.from(map.entries())
  }, [filtered])

  const ready = status === 'ready'
  const actions = ready ? (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen({ kind: 'import' })}>
        <FileUp className="h-4 w-4" /> Import
      </button>
      <button type="button" className="btn btn-primary" onClick={() => setOpen({ kind: 'add' })}>
        <Plus className="h-4 w-4" /> Add
      </button>
    </>
  ) : undefined

  return (
    <>
      <PageHeader eyebrow="Finance" title="Transactions" description="Every payment in and out, with your notes and receipts." actions={actions} />

      {!ready ? (
        <div className="card">
          <ConnectDrive context="transactions" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions yet"
            description="Add one by hand with notes and a receipt, or import many at once from your bank's CSV export."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setOpen({ kind: 'add' })}><Plus className="h-4 w-4" /> Add transaction</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ kind: 'import' })}><FileUp className="h-4 w-4" /> Import CSV</button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input className={`${inputClass} pl-10`} placeholder="Search description, notes, tags…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search transactions" />
            </div>
            <div className="flex gap-2">
              <div role="radiogroup" aria-label="Filter" className="grid flex-1 grid-cols-3 gap-1 rounded-xl border border-line-strong p-1 sm:flex-none">
                {(['all', 'out', 'in'] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={dir === d} onClick={() => setDir(d)} className={`min-h-9 rounded-lg px-3 text-sm font-medium ${dir === d ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`}>
                    {d === 'all' ? 'All' : d === 'out' ? 'Out' : 'In'}
                  </button>
                ))}
              </div>
              <button type="button" className="icon-btn border border-line-strong" aria-label="Reload from Drive" onClick={() => void refresh()} disabled={busy}>
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <ErrorNote>{error}</ErrorNote>

          {groups.length === 0 && <p className="py-10 text-center text-slate-400">Nothing matches your search.</p>}

          {groups.map(([month, list]) => {
            const byCur = new Map<string, { in: number; out: number }>()
            for (const t of list) {
              if (isTransfer(t)) continue
              const c = byCur.get(t.currency) ?? { in: 0, out: 0 }
              c[t.direction] += t.amount
              byCur.set(t.currency, c)
            }
            return (
              <section key={month} className="card overflow-hidden p-0">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                  <h2 className="font-semibold text-white">{monthLabel(month)}</h2>
                  <p className="text-xs text-slate-400">
                    {Array.from(byCur.entries()).map(([cur, v]) => (
                      <span key={cur} className="ml-3">In {formatMoney(v.in, cur)} · Out {formatMoney(v.out, cur)}</span>
                    ))}
                  </p>
                </header>
                <ul className="divide-y divide-line">
                  {list.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpen({ kind: 'details', tx: t })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] sm:px-5">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isTransfer(t) ? 'bg-white/5 text-slate-400' : t.direction === 'in' ? 'bg-brand-success/15 text-brand-success' : 'bg-white/5 text-slate-300'}`}>
                          {isTransfer(t) ? <ArrowLeftRight className="h-4 w-4" /> : t.direction === 'in' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[15px] font-medium text-white">{t.description}</span>
                            {t.documentIds.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-label="Has documents" />}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {t.date} · {t.category}
                            {t.account ? ` · ${t.account}` : ''}
                            {t.notes ? ` · ${t.notes}` : ''}
                          </span>
                          {t.tags.length > 0 && <span className="mt-1 block"><TagChips tags={t.tags} /></span>}
                        </span>
                        <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${t.direction === 'in' ? 'text-brand-success' : 'text-white'}`}>
                          {formatMoney(t.amount, t.currency, t.direction)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {open?.kind === 'add' && <TransactionDialog onClose={() => setOpen(null)} onImportStatement={(file) => setOpen({ kind: 'import', file })} />}
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
    </>
  )
}
