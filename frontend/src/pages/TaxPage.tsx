import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileCheck2, Info } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useLedger } from '../context/LedgerContext'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { DE_YEARS } from '../lib/tax/de'
import { IN_YEARS } from '../lib/tax/india'
import { NOT_ADVICE } from '../lib/tax/types'
import { deductionSuggestions, taxYearSummary, type TaxCountry } from '../lib/tax/summary'
import { documentChecklist, filingDeadlines } from '../lib/tax/checklist'
import { formatMoney } from '../lib/ledger/types'

const CURRENCY: Record<TaxCountry, string> = { DE: 'EUR', IN: 'INR' }
const YEARS: Record<TaxCountry, number[]> = { DE: DE_YEARS, IN: IN_YEARS.map(Number) }

/** "2025" for Germany, "FY 2025-26" for India */
const yearLabel = (country: TaxCountry, year: number) => (country === 'IN' ? `FY ${year}-${String(year + 1).slice(2)}` : String(year))

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** Tax figures from the user's own Ledger, with the documents and dates still needed. Estimates only. */
export function TaxPage() {
  const { status, transactions, documents } = useLedger()
  const [country, setCountry] = useState<TaxCountry>('DE')
  const [year, setYear] = useState<number>(() => YEARS.DE.at(-1) ?? 2025)
  const ready = status === 'ready'
  const currency = CURRENCY[country]

  const summary = useMemo(() => taxYearSummary(transactions, country, year, currency), [transactions, country, year, currency])
  const suggestions = useMemo(() => deductionSuggestions(transactions, country, year, currency), [transactions, country, year, currency])
  const toReview = suggestions.filter((s) => !s.alreadyTagged).length
  const checklist = useMemo(() => documentChecklist(documents, country, year), [documents, country, year])
  const dates = useMemo(() => filingDeadlines(country, year), [country, year])
  const missing = checklist.filter((c) => c.missing).length

  const changeCountry = (c: TaxCountry) => {
    setCountry(c)
    setYear(YEARS[c].at(-1) ?? YEARS[c][0])
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Tax" description="Your tax year from the Ledger: income, what you may be able to claim, and what to gather." />

      {!ready ? (
        <div className="card"><ConnectDrive context="transactions" /></div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <div role="radiogroup" aria-label="Country" className="flex gap-1 rounded-xl border border-line-strong p-1">
              {(['DE', 'IN'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={country === c} onClick={() => changeCountry(c)} className={`min-h-9 rounded-lg px-3 text-sm font-medium ${country === c ? 'bg-brand text-white' : 'text-slate-400 hover:text-ink'}`}>
                  {c === 'DE' ? 'Germany' : 'India'}
                </button>
              ))}
            </div>
            <select className="min-h-9 rounded-xl border border-line-strong bg-transparent px-3 text-sm text-ink" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Tax year">
              {YEARS[country].map((y) => <option key={y} value={y}>{yearLabel(country, y)}</option>)}
            </select>
          </div>

          <section className="card space-y-3 px-5 py-5 sm:px-6" aria-label="Income for the year">
            <p className="text-sm text-slate-400">Taxable income in {yearLabel(country, year)}</p>
            <p className="text-3xl font-semibold tabular-nums text-ink">{formatMoney(summary.taxableIncome, currency)}</p>
            {summary.incomeByCategory.length > 0 && (
              <ul className="space-y-1 text-sm">
                {summary.incomeByCategory.map((c) => (
                  <li key={c.category} className="flex justify-between text-slate-300"><span>{c.category}</span><span className="tabular-nums">{formatMoney(c.amount, currency)}</span></li>
                ))}
              </ul>
            )}
            {summary.incomeByCategory.length === 0 && <p className="text-sm text-slate-400">No taxable income recorded for this year yet.</p>}
            {summary.unclassifiedIn > 0 && (
              <p className="text-sm text-amber-200">
                {summary.unclassifiedIn} money-in {summary.unclassifiedIn === 1 ? 'payment is' : 'payments are'} not clearly income. <Link to="/transactions" className="underline">Check them in Transactions</Link>.
              </p>
            )}
          </section>

          <section className="card space-y-2 px-5 py-5 sm:px-6" aria-label="Deductions to review">
            <p className="flex items-center gap-2 font-medium text-ink"><FileCheck2 className="h-4 w-4" /> Deductions to review</p>
            <p className="text-sm text-slate-300">
              {toReview === 0 ? 'Nothing waiting for review.' : `${toReview} ${toReview === 1 ? 'payment may' : 'payments may'} be deductible. Confirm each one in Transactions; nothing is claimed automatically.`}
            </p>
          </section>

          <section className="card space-y-3 px-5 py-5 sm:px-6" aria-label="Documents to gather">
            <p className="font-medium text-ink">
              Documents to gather {missing > 0 && <span className="text-sm font-normal text-amber-200">({missing} missing)</span>}
            </p>
            {documents.length === 0 && <p className="text-sm text-slate-400">No documents saved yet. Upload them in Documents.</p>}
            <ul className="divide-y divide-line">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-slate-200">{c.label}</span>
                  <span className={c.missing ? 'text-amber-200' : 'text-brand-success'}>{c.missing ? 'Missing' : `${c.found.length} ${c.found.length === 1 ? 'file' : 'files'}`}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card space-y-3 px-5 py-5 sm:px-6" aria-label="Filing dates">
            <p className="flex items-center gap-2 font-medium text-ink"><CalendarDays className="h-4 w-4" /> Filing dates</p>
            {!dates.covered ? (
              <p className="text-sm text-slate-400">No checked filing dates for {yearLabel(country, year)} yet. Check your tax office or portal.</p>
            ) : (
              <ul className="space-y-3">
                {dates.deadlines.map((d) => (
                  <li key={d.label} className="text-sm">
                    <p className="text-ink">{d.label}: <span className="tabular-nums">{longDate(d.date)}</span></p>
                    <p className="text-slate-400">{d.note}{d.confirm ? ' Confirm on the official portal.' : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="flex items-start gap-2 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {NOT_ADVICE}</p>
          {transactions.length === 0 && <EmptyState icon={CalendarDays} title="No transactions yet" description="Add your income and payments, and this page fills in." />}
        </div>
      )}
    </>
  )
}
