import { useState } from 'react'
import { totalsFor, type Span } from '../../lib/ledger/summary'
import { headlineLines, weekSpans } from '../../lib/ledger/headline'
import type { Transaction } from '../../lib/ledger/types'

type Scope = 'period' | 'week'

/**
 * The Overview's first answer: what happened in plain words. "Period" follows the arrows below;
 * "Last 7 days" is a rolling week that does not depend on the period picked.
 */
export function HeadlineCard({
  transactions,
  currency,
  today,
  period,
  previous,
  periodNoun,
  previousNoun,
}: {
  transactions: Transaction[]
  currency: string
  today: string
  period: Span
  previous: Span | null
  periodNoun: string
  previousNoun: string
}) {
  const [scope, setScope] = useState<Scope>('period')
  const week = weekSpans(today)
  const empty = { income: 0, spending: 0, net: 0, count: 0 }

  const now = scope === 'period' ? totalsFor(transactions, period, currency) : totalsFor(transactions, week.now, currency)
  const before = scope === 'period'
    ? previous ? totalsFor(transactions, previous, currency) : empty
    : totalsFor(transactions, week.before, currency)
  const lines = headlineLines(now, before, scope === 'period' ? periodNoun : 'in the last 7 days', scope === 'period' ? previousNoun : 'the 7 days before', currency)

  return (
    <section className="card space-y-3 px-5 py-5 sm:px-6" aria-label="Headline">
      <div role="radiogroup" aria-label="Headline period" className="inline-flex gap-1 rounded-xl border border-line-strong p-1">
        {([['period', 'This period'], ['week', 'Last 7 days']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={scope === key}
            onClick={() => setScope(key)}
            className={`min-h-8 rounded-lg px-3 text-sm font-medium ${scope === key ? 'bg-brand text-white' : 'text-slate-400 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-lg font-semibold text-ink">{lines[0]}</p>
      {lines.slice(1).map((l) => (
        <p key={l} className="text-[15px] text-slate-300">{l}</p>
      ))}
    </section>
  )
}
