import type { PutInRow } from '../../../lib/ledger/allocation'
import { rankedGains } from '../../../lib/ledger/investViz'
import type { ReviewHolding } from '../../../lib/ledger/review'
import { formatMoney } from '../../../lib/ledger/types'
import { pct, VizCard } from './shared'

/** Per account: what was put in next to what it is worth now, on one shared scale. */
export function PutInBars({ rows, currency }: { rows: PutInRow[]; currency: string }) {
  const own = rows.filter((r) => r.currency.toUpperCase() === currency.toUpperCase())
  if (own.length === 0) return null
  const max = Math.max(1, ...own.flatMap((r) => [r.putIn, r.worth]))
  const gain = own.reduce((s, r) => s + r.change, 0)
  return (
    <VizCard title="Put in and worth" note={`Across these accounts: ${gain >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(gain), currency)} beyond what was paid in.`}>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {own.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{r.name}</span>
              <span className={`tabular-nums ${r.change >= 0 ? 'text-good' : 'text-bad'}`}>
                {r.change >= 0 ? '+' : ''}{formatMoney(r.change, r.currency)}{r.changeShare !== null ? ` (${r.change >= 0 ? '+' : ''}${pct(r.changeShare, 0)})` : ''}
              </span>
            </span>
            {[
              { label: 'Put in', value: r.putIn, color: 'var(--color-line-strong)' },
              { label: 'Worth', value: r.worth, color: 'var(--color-brand-soft)' },
            ].map((b) => (
              <span key={b.label} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-slate-400">{b.label}</span>
                <span className="block h-3 flex-1" role="img" aria-label={`${r.name} ${b.label}: ${formatMoney(b.value, r.currency)}`}>
                  <span className="block h-full rounded-r-md" style={{ width: `${Math.max(1, (b.value / max) * 100)}%`, background: b.color }} />
                </span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-300">{formatMoney(b.value, r.currency)}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </VizCard>
  )
}

/** Holdings with a price, best to worst, as bars either side of zero. */
export function GainBars({ holdings }: { holdings: ReviewHolding[] }) {
  const rows = rankedGains(holdings)
  if (rows.length === 0) return null
  const max = Math.max(0.01, ...rows.map((h) => Math.abs(h.gainShare ?? 0)))
  return (
    <VizCard title="Gain by holding" note="Value now against what was paid, fees included. Gains are before tax.">
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {rows.map((h, i) => {
          const g = h.gainShare ?? 0
          const w = (Math.abs(g) / max) * 50
          return (
            <li key={`${h.name}-${i}`} className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-3 text-sm">
              <span className="truncate text-ink" title={h.name}>{h.name}</span>
              <span className="relative block h-3" role="img" aria-label={`${h.name}: ${g >= 0 ? 'up' : 'down'} ${pct(Math.abs(g))}`}>
                <span className="absolute left-1/2 top-0 h-full w-px bg-line-strong" aria-hidden />
                <span
                  className="absolute top-0 block h-full"
                  style={{ width: `${w}%`, background: g >= 0 ? 'var(--color-good)' : 'var(--color-bad)', ...(g >= 0 ? { left: '50%', borderRadius: '0 6px 6px 0' } : { right: '50%', borderRadius: '6px 0 0 6px' }) }}
                />
              </span>
              <span className={`text-right tabular-nums ${g >= 0 ? 'text-good' : 'text-bad'}`}>{g >= 0 ? '+' : ''}{pct(g)}</span>
            </li>
          )
        })}
      </ul>
    </VizCard>
  )
}
