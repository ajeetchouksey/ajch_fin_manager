import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, RotateCcw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { ErrorNote } from '../components/ledger/ui'
import { useLedger } from '../context/LedgerContext'
import { ANALYSIS_KINDS, isStale, type Analysis, type AnalysisKind, type AnalysisStatus, type Verified } from '../lib/ledger/analysis'
import { formatMoney } from '../lib/ledger/types'

const KIND_LABEL: Record<AnalysisKind, string> = {
  analysis: 'Analysis',
  recommendation: 'Recommendation',
  projection: 'Projection',
  data_issue: 'Data issue',
  categorisation: 'Categorisation suggestion',
}

const VERIFIED: Record<Verified, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  yes: { label: 'Figures match your ledger', tone: 'text-brand-success', Icon: CheckCircle2 },
  no: { label: 'A figure does not match your ledger', tone: 'text-rose-300', Icon: AlertTriangle },
  not_checked: { label: 'Figures not checked', tone: 'text-slate-400', Icon: HelpCircle },
}

const STATUS_FILTERS: Array<AnalysisStatus | 'all'> = ['open', 'done', 'dismissed', 'all']

function EntryCard({ entry, stale, currency, busy, onStatus }: { entry: Analysis; stale: boolean; currency: string; busy: boolean; onStatus: (s: AnalysisStatus) => void }) {
  const v = VERIFIED[entry.verified]
  const period = entry.periodStart ? `${entry.periodStart} to ${entry.periodEnd}` : null
  return (
    <article className="card px-5 py-5 sm:px-6" aria-labelledby={`an-${entry.id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-line-strong px-2 py-0.5 text-slate-200">{KIND_LABEL[entry.kind]}</span>
        <span>{entry.createdAt.slice(0, 10)}</span>
        <span>· {entry.writtenBy}</span>
        {period && <span>· {period}</span>}
      </div>
      <h3 id={`an-${entry.id}`} className="text-base font-semibold text-white">{entry.title}</h3>
      <p className={`mt-1 flex items-center gap-1.5 text-xs ${v.tone}`}>
        <v.Icon className="h-3.5 w-3.5" aria-hidden /> {v.label}
      </p>
      {stale && <p className="mt-1 text-xs text-amber-200">May be out of date: your ledger has changed since this was written.</p>}
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-200">{entry.body}</p>

      {entry.figures.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1.5">Figure</th>
                <th className="py-1.5 text-right">Saved</th>
                <th className="py-1.5 text-right">Your ledger</th>
                <th className="py-1.5 text-right">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-slate-300">
              {entry.figures.map((f, i) => (
                <tr key={`${f.name}-${i}`}>
                  <td className="py-1.5">
                    {f.name}
                    {f.source && <span className="block text-xs text-slate-500">{f.source}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(f.value, f.currency || currency)}</td>
                  <td className="py-1.5 text-right tabular-nums">{f.actual === null ? '–' : formatMoney(f.actual, f.currency || currency)}</td>
                  <td className={`py-1.5 text-right ${f.matches === false ? 'text-rose-300' : f.matches ? 'text-brand-success' : 'text-slate-500'}`}>
                    {f.matches === null ? 'not checked' : f.matches ? 'matches' : 'differs'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {entry.status === 'open' ? (
          <>
            <button type="button" className="btn btn-secondary min-h-9 px-3 py-1.5 text-sm" disabled={busy} onClick={() => onStatus('done')}>Mark done</button>
            <button type="button" className="btn btn-secondary min-h-9 px-3 py-1.5 text-sm" disabled={busy} onClick={() => onStatus('dismissed')}>Dismiss</button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary min-h-9 px-3 py-1.5 text-sm" disabled={busy} onClick={() => onStatus('open')}>
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </button>
        )}
      </div>
    </article>
  )
}

/** AI analysis, recommendations and projections saved to the user's Analysis tab, with their checks. */
export function AnalysisPage() {
  const { status, analysis, transactions, setAnalysisStatus, busy, error, clearError } = useLedger()
  const [kind, setKind] = useState<AnalysisKind | 'all'>('all')
  const [filter, setFilter] = useState<AnalysisStatus | 'all'>('open')
  const [localError, setLocalError] = useState<string | null>(null)

  const currency = useMemo(() => transactions.find((t) => t.currency)?.currency ?? 'EUR', [transactions])
  const entries = useMemo(
    () =>
      analysis
        .filter((a) => (kind === 'all' || a.kind === kind) && (filter === 'all' || a.status === filter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [analysis, kind, filter],
  )

  if (status !== 'ready') {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Analysis" description="Analysis and recommendations saved by your AI apps, checked against your ledger." />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </>
    )
  }

  const change = async (entry: Analysis, next: AnalysisStatus) => {
    setLocalError(null)
    clearError()
    try {
      await setAnalysisStatus(entry, next)
    } catch {
      setLocalError('That change could not be saved. Try again.')
    }
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Analysis" description="Analysis and recommendations saved by your AI apps. Each figure is checked against your ledger." />

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
          {(['all', ...ANALYSIS_KINDS] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-9 rounded-full border px-3 text-sm ${kind === k ? 'border-brand-soft bg-brand/20 text-white' : 'border-line-strong text-slate-400 hover:text-white'}`}
            >
              {k === 'all' ? 'All' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={`min-h-9 rounded-full border px-3 text-sm capitalize ${filter === s ? 'border-brand-soft bg-brand/20 text-white' : 'border-line-strong text-slate-400 hover:text-white'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote>{localError || error}</ErrorNote>

      {entries.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm text-slate-400">
          {analysis.length ? 'Nothing matches these filters.' : 'No analysis yet. Ask your AI app to save one, and it will appear here.'}
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              stale={isStale(e, transactions)}
              currency={currency}
              busy={busy}
              onStatus={(s) => void change(e, s)}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">General guidance, not regulated financial advice. Figures marked as not matching should be checked before you act on them.</p>
    </>
  )
}
