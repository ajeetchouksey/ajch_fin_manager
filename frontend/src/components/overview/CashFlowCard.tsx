import { useState } from 'react'
import { formatMoney } from '../../lib/ledger/types'
import { privately } from '../../lib/ledger/privacy'

export interface FlowPoint {
  key: string
  label: string
  income: number
  spending: number
}

const PLOT = 200

/** Axis top: four equal steps of a round size (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^n) that cover the largest value. */
export function axisMax(v: number): number {
  if (v <= 0) return 1000
  const raw = v / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= raw) return m * p * 4
  return 40 * p
}

const short = (n: number, currency: string) => {
  try {
    return privately(new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n))
  } catch {
    return String(Math.round(n))
  }
}

/** Cash flow (design): income (green) and spending (orange) bars per period, axis on the left, a note below. */
export function CashFlowCard({
  title,
  points,
  currency,
  selected,
  onSelect,
  note,
}: {
  title: string
  points: FlowPoint[]
  currency: string
  selected?: string
  onSelect?: (key: string) => void
  note?: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const top = axisMax(Math.max(...points.flatMap((p) => [p.income, p.spending]), 0))
  const ticks = [4, 3, 2, 1, 0].map((i) => (top / 4) * i)
  const h = (v: number) => `${Math.max(v > 0 ? 2 : 0, Math.round((v / top) * PLOT))}px`
  const cols = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }
  const shown = points.find((p) => p.key === (hover ?? selected))

  return (
    <section aria-labelledby="cf-heading" className="card flex min-w-0 flex-col gap-5 p-6 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cf-heading" className="card-title">{title}</h2>
        <div className="flex gap-4 text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-good" />Income</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-spend" />Spending</span>
        </div>
      </div>

      <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-3">
        <div className="flex h-[200px] flex-col justify-between text-right text-xs tabular-nums text-slate-500" aria-hidden>
          {ticks.map((t) => <span key={t}>{short(t, currency)}</span>)}
        </div>
        <div
          className="grid h-[200px] items-end gap-3 border-b border-line-strong"
          style={{ ...cols, background: 'repeating-linear-gradient(to bottom, transparent 0, transparent 49px, var(--color-track) 49px, var(--color-track) 50px)' }}
          role="img"
          aria-label={`${title}, in ${currency}`}
        >
          {points.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onSelect?.(p.key)}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.key)}
              onBlur={() => setHover(null)}
              aria-label={`${p.label}: income ${formatMoney(p.income, currency)}, spending ${formatMoney(p.spending, currency)}`}
              aria-pressed={p.key === selected}
              className={`flex h-full items-end justify-center gap-1.5 rounded-t-lg ${p.key === selected ? 'bg-tint' : ''}`}
            >
              <span className="w-[22px] max-w-[40%] rounded-t-md bg-good" style={{ height: h(p.income) }} />
              <span className="w-[22px] max-w-[40%] rounded-t-md bg-spend" style={{ height: h(p.spending) }} />
            </button>
          ))}
        </div>
        <div />
        <div className="grid gap-3 text-center text-xs text-slate-500" style={cols}>
          {points.map((p) => (
            <span key={p.key} className={p.key === selected ? 'font-semibold text-ink' : ''}>{p.label}</span>
          ))}
        </div>
      </div>

      <p className="min-h-5 text-sm text-slate-400" aria-live="polite">
        {shown ? (
          <>
            <b className="text-ink">{shown.label}</b> · in <span className="text-good">{formatMoney(shown.income, currency)}</span> · out{' '}
            <span className="text-ink">{formatMoney(shown.spending, currency)}</span> · left {formatMoney(shown.income - shown.spending, currency)}
          </>
        ) : null}
      </p>
      {note && <p className="rounded-xl bg-warn-bg px-3.5 py-3 text-warn-text">{note}</p>}
    </section>
  )
}
