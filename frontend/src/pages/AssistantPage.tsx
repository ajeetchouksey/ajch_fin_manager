import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, MessageCircleQuestion, Send, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { useLedger } from '../context/LedgerContext'
import { expensiveMonth, monthlySpend, yearOnYear } from '../lib/analysis/answers'
import { recurring } from '../lib/analysis/engine'
import { categoryColor } from '../lib/ledger/categoryColors'
import { currenciesByUse, monthName, spendingByCategory } from '../lib/ledger/summary'
import { formatMoney, todayIso, INCOME_CATEGORIES } from '../lib/ledger/types'

type Q = 'expensive' | 'regular' | 'year' | 'other' | 'budgets'
type Msg = { id: number; q: Q } | { id: number; free: string }

const PROMPTS: Array<{ q: Q; text: string }> = [
  { q: 'other', text: 'Sort my “Other” payments' },
  { q: 'year', text: 'Am I spending more than last year?' },
  { q: 'budgets', text: 'Set budgets from my average' },
]
const QUESTIONS: Record<Exclude<Q, 'expensive'>, string> = {
  regular: 'What do I pay every month?',
  other: PROMPTS[0].text,
  year: PROMPTS[1].text,
  budgets: PROMPTS[2].text,
}

/** Your AI app with the question filled in; with the FinBuddy connector it reads the Ledger (D5). */
const AI_APPS = [
  { name: 'Claude', url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: 'ChatGPT', url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
]

const compact = (v: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v)

let nextId = 1

/** Assistant (design: Assistant): monthly spending with a highlighted month, and answers about it. */
export function AssistantPage() {
  const { status, transactions } = useLedger()
  const navigate = useNavigate()
  const today = todayIso()
  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? 'EUR', [transactions])
  const year = useMemo(() => transactions.reduce((m, t) => (t.date > m ? t.date : m), '').slice(0, 4) || today.slice(0, 4), [transactions, today])
  const months = useMemo(() => monthlySpend(transactions, currency, year), [transactions, currency, year])
  const expensive = useMemo(() => expensiveMonth(transactions, currency, year), [transactions, currency, year])
  const [picked, setPicked] = useState<string | null>(null)
  const highlight = picked ?? expensive?.month ?? months.at(-1)?.month ?? ''
  const breakdown = useMemo(() => (highlight ? spendingByCategory(transactions, highlight, currency, 6) : []), [transactions, highlight, currency])
  const highlightTotal = months.find((m) => m.month === highlight)?.spending ?? 0
  const max = Math.max(1, ...months.map((m) => m.spending))

  const bills = useMemo(
    () =>
      recurring(transactions, currency, today)
        .filter((r) => r.direction === 'out' && !r.lapsed && !INCOME_CATEGORIES.includes(r.category) && r.category !== 'Transfer')
        .sort((a, b) => b.monthly - a.monthly)
        .slice(0, 6),
    [transactions, currency, today],
  )
  const monthsInLedger = useMemo(() => new Set(transactions.map((t) => t.date.slice(0, 7))).size, [transactions])
  const otherCount = useMemo(() => transactions.filter((t) => /^other( income)?$/i.test(t.category)).length, [transactions])
  const yoy = useMemo(() => yearOnYear(transactions, currency), [transactions, currency])

  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { id: nextId++, q: 'expensive' },
    { id: nextId++, q: 'regular' },
  ])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [draft, setDraft] = useState('')
  const ask = (q: Q) => setMsgs((m) => [...m, { id: nextId++, q }])
  const send = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMsgs((m) => [...m, { id: nextId++, free: text }])
    setDraft('')
  }

  const mName = (ym: string) => monthName(ym).split(' ')[0]
  const question = (q: Q) =>
    q === 'expensive' ? (expensive ? `Why was ${mName(expensive.month)} so expensive?` : 'Which month cost the most?') : QUESTIONS[q]

  const answer = (m: Msg): ReactNode => {
    if ('free' in m) {
      const prompt = `Using my FinBuddy ledger: ${m.free}`
      return (
        <>
          <span>I answer the questions above straight from your ledger. For anything else, ask your AI app — with the FinBuddy connector it reads the same ledger.</span>
          <div className="flex flex-wrap gap-2">
            {AI_APPS.map((a) => (
              <a key={a.name} href={a.url(prompt)} target="_blank" rel="noreferrer" className="btn btn-secondary min-h-10">
                Ask in {a.name} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ))}
          </div>
          <Link to="/settings" className="text-xs text-slate-400 underline">How to connect FinBuddy to your AI app</Link>
        </>
      )
    }
    switch (m.q) {
      case 'expensive': {
        if (!expensive) return <span>There is no spending in {year} yet.</span>
        const e = expensive
        const highest = months.length > 1
        return (
          <>
            <span>
              {mName(e.month)} spending was <b>{formatMoney(e.spending, currency)}</b>
              {e.income > 0 && <> against <b>{formatMoney(e.income, currency)}</b> coming in</>}
              {highest ? ` — the highest month in ${year}.` : '.'}
            </span>
            {e.largest && (
              <span>
                {e.largest.share >= 0.4 ? 'Almost half is one payment' : e.largest.share >= 0.25 ? 'A big part is one payment' : 'The biggest single payment was'}:{' '}
                <b>{formatMoney(e.largest.amount, currency)} to {e.largest.name}</b> ({e.largest.category}).
                {e.rest.length > 0 && <> Then {e.rest.map((r) => (r.category === e.largest!.category ? `another ${formatMoney(r.amount, currency)} in ${r.category}` : `${r.category} ${formatMoney(r.amount, currency)}`)).join(' and ')}</>}
                {e.other.count > 0 ? <>{e.rest.length ? ', and ' : ' '}{formatMoney(e.other.amount, currency)} across {e.other.count} payment{e.other.count === 1 ? '' : 's'} still in “Other”.</> : e.rest.length ? '.' : ''}
              </span>
            )}
            {e.other.count > 0 && !dismissed.has(m.id) && (
              <>
                <span>Want to see {mName(e.month)}’s “Other” payments so you can sort them?</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary min-h-10" onClick={() => navigate(`/transactions?q=Other`)}>List them</button>
                  <button type="button" className="btn btn-secondary min-h-10" onClick={() => setDismissed((d) => new Set(d).add(m.id))}>Not now</button>
                </div>
              </>
            )}
            <span className="text-xs text-slate-400">Source: FinBuddy · calendar month {monthName(e.month)}</span>
          </>
        )
      }
      case 'regular':
        if (!bills.length) return <span>No payments repeat yet. After two or three months of transactions, rent, subscriptions and bills show up here.</span>
        return (
          <>
            <span>Payments that come back regularly:</span>
            {bills.map((b) => (
              <div key={b.key} className="flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: categoryColor(b.category) }} />
                <span className="min-w-0 truncate">{b.name}</span>
                <span className="ml-auto font-semibold tabular-nums">{formatMoney(b.amount, currency)}</span>
              </div>
            ))}
            <span className="text-xs text-slate-400">
              {monthsInLedger <= 2 ? `Based on ${monthsInLedger} month${monthsInLedger === 1 ? '' : 's'} — I'll be surer after the next import.` : `Based on ${monthsInLedger} months of your ledger.`}
            </span>
          </>
        )
      case 'year':
        if (yoy.kind === 'empty') return <span>There are no transactions to compare yet.</span>
        if (yoy.kind === 'no-history') return <span>Your ledger starts in {monthName(yoy.firstMonth)}, so there is no full last year to compare with yet. Import older statements to see it.</span>
        {
          const diff = yoy.thisYear - yoy.lastYear
          const pct = yoy.lastYear > 0 ? Math.round((Math.abs(diff) / yoy.lastYear) * 100) : null
          return (
            <>
              <span>
                January to {mName(yoy.throughMonth)} you spent <b>{formatMoney(yoy.thisYear, currency)}</b>, against <b>{formatMoney(yoy.lastYear, currency)}</b> in the same months last year
                {pct !== null && <> — <b className={diff > 0 ? 'text-spend' : 'text-good'}>{pct}% {diff > 0 ? 'more' : 'less'}</b></>}.
              </span>
              <span className="text-xs text-slate-400">Transfers between your own accounts are left out.</span>
            </>
          )
        }
      case 'other':
        return otherCount ? (
          <>
            <span><b>{otherCount}</b> payment{otherCount === 1 ? ' is' : 's are'} still in “Other”. Select them on Transactions and give them a category in one go — new imports then follow your choice.</span>
            <div><button type="button" className="btn btn-primary min-h-10" onClick={() => navigate('/transactions?q=Other')}>Sort them now</button></div>
          </>
        ) : (
          <span>Nothing is in “Other” — every payment has a category.</span>
        )
      case 'budgets':
        return (
          <>
            <span>Budgets can start from what you usually spend: the suggestions use your last three months and leave out one-off spikes.</span>
            <div><button type="button" className="btn btn-primary min-h-10" onClick={() => navigate('/budgets')}>Open budgets</button></div>
          </>
        )
    }
  }

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Assistant" />
        <section className="card"><ConnectDrive context="transactions" /></section>
      </>
    )
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader eyebrow={`Reports · ${year}`} title="Monthly spending" actions={<Link to="/dashboard" className="flex min-h-11 items-center font-semibold text-accent">Back to overview</Link>} />

        <section aria-label={`Monthly spending in ${year}`} className="card flex flex-col gap-3.5 p-6">
          {months.length === 0 ? (
            <p className="py-10 text-center text-slate-400">No spending in {year} yet.</p>
          ) : (
            <>
              <div className="flex h-[260px] items-end gap-2 border-b border-line-strong sm:gap-3">
                {months.map((m) => {
                  const hot = m.month === highlight
                  return (
                    <button
                      key={m.month}
                      type="button"
                      aria-pressed={hot}
                      aria-label={`${monthName(m.month)}: ${formatMoney(m.spending, currency)}`}
                      onClick={() => setPicked(m.month)}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <span className={`text-[11px] font-semibold tabular-nums sm:text-xs ${hot ? 'text-warn-text' : 'text-slate-400'}`}>{compact(m.spending, currency)}</span>
                      <span
                        className="w-full max-w-12 rounded-t-lg bg-spend"
                        style={{ height: `${Math.max(2, Math.round((m.spending / max) * 220))}px`, opacity: hot ? 1 : 0.45, outline: hot ? '2px solid var(--color-accent)' : undefined, outlineOffset: 3 }}
                      />
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2 text-center text-xs text-slate-400 sm:gap-3">
                {months.map((m) => <span key={m.month} className="min-w-0 flex-1">{monthName(m.month, 'short')}</span>)}
              </div>
            </>
          )}
        </section>

        {highlight && breakdown.length > 0 && (
          <section aria-label={`${monthName(highlight)} breakdown`} className="flex flex-col gap-3.5 rounded-2xl border-2 border-accent bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="card-title text-2xl">{mName(highlight)} · {formatMoney(highlightTotal, currency)}</h2>
              <span className="font-semibold text-accent">{highlight === expensive?.month && !picked ? 'Highlighted by the assistant' : 'Your pick'}</span>
            </div>
            <div role="img" aria-label={`Split: ${breakdown.map((c) => `${c.category} ${formatMoney(c.amount, currency)}`).join(', ')}`} className="flex h-7 gap-0.5 overflow-hidden rounded-lg">
              {breakdown.map((c) => <div key={c.category} style={{ flex: c.amount, background: categoryColor(c.category) }} />)}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-2">
              {breakdown.map((c) => (
                <div key={c.category} className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: categoryColor(c.category) }} />
                  <span className="truncate text-slate-300">{c.category}</span>
                  <span className="ml-auto font-semibold tabular-nums text-ink">{formatMoney(c.amount, currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside aria-label="Assistant" className="card flex flex-col overflow-hidden p-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-tint text-accent"><MessageCircleQuestion className="h-5 w-5" aria-hidden /></span>
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-bold text-ink">Ask about your money</span>
              <span className="text-xs text-slate-400">Answers worked out from your ledger, in your browser</span>
            </div>
          </div>
          <Link to="/dashboard" aria-label="Close assistant" className="icon-btn"><X className="h-5 w-5" /></Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5" aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className="flex flex-col gap-4">
              <div className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-brand px-3.5 py-3 text-white">{'free' in m ? m.free : question(m.q)}</div>
              <div className="flex max-w-[92%] flex-col gap-2.5 rounded-[14px_14px_14px_4px] border border-line bg-canvas px-4 py-3.5 leading-normal text-ink">{answer(m)}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-6 pt-4 pb-6">
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button key={p.q} type="button" onClick={() => ask(p.q)} className="min-h-9 rounded-full border border-tintline bg-tint px-3 text-[13px] text-slate-200 hover:text-ink">
                {p.text}
              </button>
            ))}
          </div>
          <form onSubmit={send} className="flex items-center gap-2 rounded-[14px] border border-line-strong py-1.5 pr-1.5 pl-3.5">
            <label htmlFor="ask" className="sr-only">Ask a question</label>
            <input id="ask" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about spending, bills, goals…" className="min-h-10 flex-1 bg-transparent text-ink outline-none" />
            <button type="submit" aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-brand text-white disabled:opacity-50" disabled={!draft.trim()}>
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </aside>
    </div>
  )
}
