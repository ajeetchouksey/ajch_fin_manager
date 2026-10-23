import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { categoryColor } from '../../lib/ledger/categoryColors'
import type { CategoryShare } from '../../lib/ledger/summary'
import { formatMoney, type Transaction } from '../../lib/ledger/types'
import { PhoneTxRow } from './PhoneTxRow'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

interface PhoneOverviewProps {
  firstName?: string
  title: string
  /** "Sep", or "cycle" in salary mode, for the In / Out tiles */
  short: string
  onPrev?: () => void
  onNext?: () => void
  hero: { label: string; value: string; note?: ReactNode; sub?: string }
  income: number
  spending: number
  /** The same figures in the second currency (the "Both" view) */
  incomeSub?: string
  spendingSub?: string
  /** Currency choice, shown when there is more than one */
  switcher?: { options: string[]; value: string; onPick: (v: string) => void }
  currency: string
  categories: CategoryShare[]
  recent: Transaction[]
  intro?: ReactNode
  after?: ReactNode
}

/** Overview on phones (design: Mobile): greeting, balance card, top categories, recent. */
export function PhoneOverview({ firstName, title, short, onPrev, onNext, hero, income, spending, incomeSub, spendingSub, switcher, currency, categories, recent, intro, after }: PhoneOverviewProps) {
  const top = categories.slice(0, 4)
  return (
    <div className="flex flex-col gap-4 md:hidden">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-slate-400">{greeting()}{firstName ? `, ${firstName}` : ''}</span>
          <h1 className="font-display text-[26px] leading-tight font-bold text-ink">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" aria-label="Previous period" disabled={!onPrev} onClick={onPrev}><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" className="icon-btn" aria-label="Next period" disabled={!onNext} onClick={onNext}><ChevronRight className="h-5 w-5" /></button>
        </div>
      </header>

      {switcher && (
        <div className="seg self-start" role="radiogroup" aria-label="Currency">
          {switcher.options.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={o === switcher.value} onClick={() => switcher.onPick(o)}>{o === 'both' ? 'Both' : o}</button>
          ))}
        </div>
      )}

      <section aria-label="Balance" className="flex flex-col gap-3.5 rounded-[20px] bg-brand p-5 text-white">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{hero.label}{hero.note ? <> · {hero.note}</> : null}</span>
          <span className="font-display text-[38px] leading-none font-bold tabular-nums">{hero.value}</span>
          {hero.sub && <span className="font-mono text-sm font-medium tabular-nums opacity-90">{hero.sub}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            [`In · ${short}`, income],
            [`Out · ${short}`, spending],
          ].map(([label, v]) => (
            <div key={label as string} className="flex flex-col gap-0.5 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.16)' }}>
              <span className="text-[13px]">{label}</span>
              <span className="text-[17px] font-bold tabular-nums">{formatMoney(v as number, currency)}</span>
              {(String(label).startsWith('In') ? incomeSub : spendingSub) && <span className="font-mono text-[12px] tabular-nums opacity-90">{String(label).startsWith('In') ? incomeSub : spendingSub}</span>}
            </div>
          ))}
        </div>
      </section>

      {top.length > 0 && (
        <section aria-labelledby="ph-cats" className="card flex flex-col gap-3 p-4">
          <h2 id="ph-cats" className="font-display text-xl font-bold text-ink">Top categories</h2>
          <div role="img" aria-label={`Spending split: ${top.map((c) => `${c.category} ${formatMoney(c.amount, currency)}`).join(', ')}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {top.map((c) => <div key={c.category} style={{ flex: c.amount, background: categoryColor(c.category) }} />)}
          </div>
          {top.map((c) => (
            <Link key={c.category} to={`/transactions?q=${encodeURIComponent(c.category)}`} className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-ink">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: categoryColor(c.category) }} />
                {c.category}
              </span>
              <span className="tabular-nums text-slate-300">{formatMoney(c.amount, currency)}</span>
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="ph-recent" className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <h2 id="ph-recent" className="font-display text-xl font-bold text-ink">Recent</h2>
          <Link to="/transactions" className="flex min-h-11 items-center font-semibold text-accent">See all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-slate-400">No transactions in this period.</p>
        ) : (
          recent.slice(0, 3).map((t) => <PhoneTxRow key={t.id} tx={t} meta="date" />)
        )}
      </section>

      {intro}

      {after}
    </div>
  )
}
