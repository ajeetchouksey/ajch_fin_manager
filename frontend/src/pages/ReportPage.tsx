import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { ErrorNote } from '../components/ledger/ui'
import { SectionHeader } from '../components/overview/OverviewParts'
import { useLedger } from '../context/LedgerContext'
import { usePeriodMode } from '../hooks/usePeriodMode'
import { REPORT_DEFAULTS, buildReport, choosePeriod, reportToHtml, type Report, type ReportLine } from '../lib/ledger/report'
import { currenciesByUse, monthName } from '../lib/ledger/summary'
import { formatMoney, todayIso } from '../lib/ledger/types'

const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function Table({ lines, currency, empty }: { lines: ReportLine[]; currency: string; empty: string }) {
  if (!lines.length) return <p className="px-5 py-6 text-sm text-slate-400 sm:px-6">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-5 py-2 sm:px-6">Item</th>
            <th className="px-3 py-2 text-right">This period</th>
            <th className="px-3 py-2 text-right">Previous</th>
            <th className="px-3 py-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l) => (
            <tr key={l.label} className={l.flag ? 'bg-amber-300/5' : ''}>
              <td className="px-5 py-2.5 align-top sm:px-6">
                <span className="text-ink">{l.label}</span>
                {l.note && <span className="mt-0.5 block text-xs text-slate-400">{l.note}</span>}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-ink">{l.label.startsWith('Savings rate') ? `${Math.round(l.current)}%` : formatMoney(l.current, currency)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                {l.previous === null ? '–' : l.label.startsWith('Savings rate') ? `${Math.round(l.previous)}%` : formatMoney(l.previous, currency)}
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${l.flag ? 'text-amber-200' : 'text-slate-300'}`}>
                {l.change === null ? '–' : `${l.change > 0 ? '+' : ''}${Math.round(l.change * 100)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The monthly report for you and your partner: figures, a watch list, and a copy you can keep or share. */
export function ReportPage() {
  const { status, transactions, budgets, createReportDoc } = useLedger()
  const [mode, setMode] = usePeriodMode()
  const [date, setDate] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [savedLink, setSavedLink] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? 'EUR', [transactions])
  const today = todayIso()
  const choice = useMemo(() => choosePeriod(transactions, mode, today, date), [transactions, mode, today, date])
  const { chosen, previous, next } = choice

  const label = (p: { start: string; end: string; kind: string; partial?: boolean; open?: boolean; expectedEnd?: string }) => {
    if (p.kind !== 'salary') return monthName(p.start.slice(0, 7))
    const end = p.open && p.expectedEnd ? p.expectedEnd : p.end
    return p.partial ? `Before the first salary, ${shortDay(p.start)} – ${shortDay(end)}` : `${shortDay(p.start)} – ${shortDay(end)}`
  }

  const report: Report | null = useMemo(() => {
    if (!chosen) return null
    return buildReport({
      transactions,
      budgets,
      currency,
      span: { start: chosen.start, end: chosen.end },
      label: label(chosen),
      open: chosen.open,
      expectedEnd: chosen.expectedEnd,
      previous: previous ? { span: { start: previous.start, end: previous.end }, label: label(previous) } : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, budgets, currency, chosen, previous])

  if (status !== 'ready') {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Report" description="The monthly report for you and your partner." />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </>
    )
  }

  const title = report ? `FinBuddy report · ${report.label}` : 'FinBuddy report'

  const saveDoc = async () => {
    if (!report) return
    setSaving(true)
    setLocalError(null)
    try {
      setSavedLink(await createReportDoc(title, reportToHtml(report, title)))
    } catch {
      setLocalError('The report could not be saved to Google Drive. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const download = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([reportToHtml(report, title)], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Report" description="The figures, what moved and why, for you and your partner. Causes are only given where the data shows them." />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label="Period">
            <button type="button" className="icon-btn border border-line-strong" aria-label="Previous period" disabled={!previous} onClick={() => setDate(previous?.start)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="min-w-44 text-center text-lg font-semibold text-ink" aria-live="polite">{chosen ? label(chosen) : 'No period yet'}</h2>
            <button type="button" className="icon-btn border border-line-strong" aria-label="Next period" disabled={!next} onClick={() => setDate(next?.start)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div role="radiogroup" aria-label="Period type" className="flex gap-1 rounded-xl border border-line-strong p-1">
            {(['calendar', 'salary'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m)
                  setDate(undefined)
                }}
                className={`min-h-9 rounded-lg px-3 text-sm font-medium ${mode === m ? 'bg-brand text-white' : 'text-slate-400 hover:text-ink'}`}
              >
                {m === 'calendar' ? 'Calendar month' : 'Salary cycle'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={!report} onClick={download}>
            <Download className="h-4 w-4" /> Download
          </button>
          <button type="button" className="btn btn-primary" disabled={!report || saving} onClick={() => void saveDoc()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save as Google Doc
          </button>
        </div>
      </div>

      {savedLink && (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-brand-success/10 px-4 py-3 text-sm text-slate-200">
          Saved to your Documents folder.
          <a href={savedLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-soft hover:underline">
            Open the report <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
      )}
      <ErrorNote>{localError}</ErrorNote>

      {!report ? (
        <div className="card px-6 py-10 text-center text-sm text-slate-400">Add transactions to see your first report.</div>
      ) : (
        <div className="space-y-6">
          <section className="card px-5 py-5 sm:px-6" aria-labelledby="headline-heading">
            <h3 id="headline-heading" className="mb-2 text-sm font-semibold text-ink">Headline</h3>
            <div className="space-y-2">
              {report.headline.map((h) => (
                <p key={h} className="text-[15px] leading-relaxed text-slate-200">{h}</p>
              ))}
            </div>
          </section>

          <section className="card p-0" aria-labelledby="fig-heading">
            <div className="pt-4"><SectionHeader id="fig-heading" title="Figures" /></div>
            <Table lines={report.metrics} currency={currency} empty="No figures for this period." />
          </section>

          <section className="card p-0" aria-labelledby="watch-heading">
            <div className="pt-4"><SectionHeader id="watch-heading" title={`Watch list (${report.watchList.length})`} /></div>
            <Table lines={report.watchList} currency={currency} empty={`Nothing moved beyond the watch threshold (${REPORT_DEFAULTS.thresholdPercent}% and ${formatMoney(REPORT_DEFAULTS.minAmount, currency)}).`} />
          </section>

          <section className="card p-0" aria-labelledby="cat-heading">
            <div className="pt-4"><SectionHeader id="cat-heading" title="All categories" /></div>
            <Table lines={report.categories} currency={currency} empty="No spending in this period." />
          </section>

          <section className="card p-0" aria-labelledby="bud-heading">
            <div className="pt-4"><SectionHeader id="bud-heading" title="Budgets" to="/dashboard" linkLabel="Edit" /></div>
            {report.budgets.length ? (
              <ul className="divide-y divide-line">
                {report.budgets.map((b) => (
                  <li key={b.category} className="flex items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                    <span className="text-slate-200">{b.category}</span>
                    <span className={`tabular-nums ${b.state === 'over' ? 'text-rose-300' : b.state === 'warn' ? 'text-amber-200' : 'text-slate-300'}`}>
                      {formatMoney(b.spent, currency)} of {formatMoney(b.limit, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-slate-400 sm:px-6">No budgets set. Set them on the Overview.</p>
            )}
          </section>

          <p className="text-xs text-slate-500">{report.basis}</p>
        </div>
      )}
    </>
  )
}
