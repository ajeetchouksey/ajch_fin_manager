import type { ReactNode } from 'react'

export interface Kpi {
  label: string
  value: string
  /** Text colour of the value: ink (default) or good (money in) */
  tone?: 'ink' | 'good'
  note?: ReactNode
  /** The same figure in the second currency (the "Both" view) */
  sub?: string
  noteTone?: 'muted' | 'good' | 'bad'
}

const VALUE = { ink: 'text-ink', good: 'text-good' }
const NOTE = { muted: 'text-slate-400', good: 'text-good', bad: 'text-bad' }

/** Key figures (design): an indigo hero card, then plain cards with a big Barlow Condensed figure. */
export function KpiRow({ hero, items }: { hero: { label: string; value: string; note?: ReactNode; sub?: string }; items: Kpi[] }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] sm:gap-4">
      <div className="col-span-2 flex flex-col gap-2.5 rounded-2xl bg-brand p-5 text-white sm:col-span-1">
        <span className="font-medium">{hero.label}</span>
        <span className="font-display text-[34px] leading-none font-bold tabular-nums">{hero.value}</span>
        {hero.sub && <span className="font-mono text-sm font-medium tabular-nums opacity-90">{hero.sub}</span>}
        {hero.note && <span className="font-medium opacity-90">{hero.note}</span>}
      </div>
      {items.map((k, i) => (
        <div key={k.label} className={`card flex min-w-0 flex-col gap-2 p-4 sm:gap-2.5 sm:p-5 ${items.length % 2 === 1 && i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}>
          <span className="font-medium text-slate-400">{k.label}</span>
          <span className={`font-display text-[26px] leading-none font-bold tabular-nums sm:text-[34px] ${VALUE[k.tone ?? 'ink']}`}>{k.value}</span>
          {k.sub && <span className="font-mono text-sm font-medium tabular-nums text-slate-400">{k.sub}</span>}
          {k.note && <span className={`text-sm font-medium sm:text-base ${NOTE[k.noteTone ?? 'muted']}`}>{k.note}</span>}
        </div>
      ))}
    </section>
  )
}
