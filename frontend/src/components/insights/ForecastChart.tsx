import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../../lib/ledger/types'
import { monthName } from '../../lib/ledger/summary'
import type { ForecastPoint } from '../../lib/analysis/engine'
import { moneyLocale } from '../../lib/ledger/money'
import { privately } from '../../lib/ledger/privacy'

const CASH = 'var(--color-viz-in)'
const WORTH = 'var(--color-brand-soft)'

function compact(n: number, currency: string) {
  try {
    return privately(new Intl.NumberFormat(moneyLocale(currency), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n))
  } catch {
    return `${Math.round(n)} ${currency}`
  }
}

/** Net worth and cash over the next months; the shaded band is the range for cash. */
export function ForecastChart({ points, currency, start }: { points: ForecastPoint[]; currency: string; start: { liquid: number; netWorth: number } }) {
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(600)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [asTable])

  const series = [{ month: 'now', liquid: start.liquid, liquidLow: start.liquid, liquidHigh: start.liquid, netWorth: start.netWorth }, ...points]
  const H = Math.round(Math.min(300, Math.max(200, W * 0.5)))
  const padL = 56
  const padR = 8
  const padT = 10
  const padB = 26
  const values = series.flatMap((p) => [p.liquidLow, p.liquidHigh, p.netWorth])
  const lo = Math.min(0, ...values)
  const hi = Math.max(1, ...values)
  const span = hi - lo || 1
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / span)
  const x = (i: number) => padL + ((W - padL - padR) * i) / (series.length - 1)
  const line = (pick: (p: (typeof series)[number]) => number) => series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ')
  const band = `${series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.liquidHigh).toFixed(1)}`).join(' ')} ${[...series].reverse().map((p, j) => `L${x(series.length - 1 - j).toFixed(1)},${y(p.liquidLow).toFixed(1)}`).join(' ')} Z`
  const ticks = [lo, lo + span / 2, hi]
  const h = hover !== null ? series[hover] : null

  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300" aria-hidden={asTable}>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: WORTH }} />Net worth</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: CASH }} />Cash</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm opacity-30" style={{ background: CASH }} />Cash range</span>
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-slate-300">Estimate</span>
        </div>
        <button type="button" className="text-xs font-medium text-brand-soft hover:text-ink" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="py-1.5">Estimated month</th><th className="py-1.5 text-right">Cash</th><th className="py-1.5 text-right">Range</th><th className="py-1.5 text-right">Net worth</th></tr>
          </thead>
          <tbody className="divide-y divide-line text-slate-300">
            {points.map((p) => (
              <tr key={p.month}>
                <td className="py-1.5">{monthName(p.month)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(p.liquid, currency)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-400">{compact(p.liquidLow, currency)} – {compact(p.liquidHigh, currency)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(p.netWorth, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" ref={boxRef}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`Forecast of cash and net worth for the next ${points.length} months, in ${currency}`} onMouseLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgb(148 163 184 / 0.14)" strokeWidth={1} />
                <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--chart-label)">{compact(v, currency)}</text>
              </g>
            ))}
            {lo < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="rgb(252 211 77 / 0.5)" strokeDasharray="4 4" />}
            <path d={band} fill={CASH} opacity={0.16} />
            <path d={line((p) => p.liquid)} fill="none" stroke={CASH} strokeWidth={2} strokeDasharray="6 4" />
            <path d={line((p) => p.netWorth)} fill="none" stroke={WORTH} strokeWidth={2.5} strokeDasharray="6 4" />
            {series.map((p, i) =>
              i % Math.ceil(series.length / 6) === 0 || i === series.length - 1 ? (
                <text key={p.month} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'} fontSize={12} fill="var(--chart-label)">
                  {p.month === 'now' ? 'Now' : monthName(p.month, 'short')}
                </text>
              ) : null,
            )}
            {series.map((_, i) => (
              <rect key={i} x={x(i) - (W - padL) / series.length / 2} y={padT} width={(W - padL) / series.length} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="rgb(148 163 184 / 0.4)" />}
          </svg>
          {h && (
            <div className="pointer-events-none absolute top-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: Math.min(Math.max(0, x(hover!) - 80), W - 170) }}>
              <p className="font-semibold text-ink">{h.month === 'now' ? 'Now' : monthName(h.month)} <span className="font-normal text-slate-400">{h.month === 'now' ? '' : '· estimate'}</span></p>
              <p className="text-slate-300">Net worth {formatMoney(h.netWorth, currency)}</p>
              <p className="text-slate-300">Cash {formatMoney(h.liquid, currency)}</p>
              {h.month !== 'now' && <p className="text-slate-400">Range {compact(h.liquidLow, currency)} – {compact(h.liquidHigh, currency)}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
