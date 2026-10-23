import { useState } from 'react'
import type { WorthSeries } from '../../../lib/ledger/investViz'
import { formatMoney } from '../../../lib/ledger/types'
import { compact, TableSwitch, useWidth, VizCard } from './shared'

const LINE = 'var(--color-brand-soft)'
const MUTED = '#94a3b8'

/** What the investment and retirement accounts were worth, month by month, from the balances you recorded. */
export function WorthChart({ series }: { series: WorthSeries }) {
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [ref, W] = useWidth()
  const pts = series.points
  const first = pts[0]
  const last = pts[pts.length - 1]
  const change = first && last ? last.value - first.value : 0

  const note =
    pts.length < 2
      ? 'Record a balance on a few dates in Accounts and the line fills in.'
      : `${formatMoney(last.value, series.currency)} now, ${change >= 0 ? 'up' : 'down'} ${formatMoney(Math.abs(change), series.currency)} since ${first.date.slice(0, 7)}.`

  const H = Math.round(Math.min(280, Math.max(180, W * 0.42)))
  const padL = 52
  const padR = 10
  const padT = 10
  const padB = 24
  const values = pts.map((p) => p.value)
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 1
  const floor = Math.max(0, lo - (hi - lo) * 0.15)
  const span = hi - floor || 1
  const x = (i: number) => padL + ((W - padL - padR) * i) / Math.max(1, pts.length - 1)
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - floor) / span)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = pts.length > 1 ? `${path} L${x(pts.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z` : ''
  const ticks = [floor, floor + span / 2, floor + span]
  const labelEvery = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - padL) / 70))))
  const h = hover !== null ? pts[hover] : null

  return (
    <VizCard title="Worth over time" note={note} actions={pts.length >= 2 ? <TableSwitch on={asTable} onToggle={() => setAsTable((v) => !v)} /> : undefined}>
      {pts.length < 2 ? null : asTable ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="py-1.5">Month end</th><th className="py-1.5 text-right">Worth</th></tr>
          </thead>
          <tbody className="divide-y divide-line text-slate-300">
            {[...pts].reverse().map((p) => (
              <tr key={p.date}><td className="py-1.5">{p.date}</td><td className="py-1.5 text-right tabular-nums">{formatMoney(p.value, series.currency)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={W} height={H} role="img" aria-label={`Worth over time, ${formatMoney(first.value, series.currency)} on ${first.date} to ${formatMoney(last.value, series.currency)} on ${last.date}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-track)" strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={MUTED}>{compact(t, series.currency)}</text>
              </g>
            ))}
            <path d={area} fill={LINE} opacity={0.14} />
            <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) =>
              (i % labelEvery === 0 && pts.length - 1 - i >= labelEvery) || i === pts.length - 1 ? (
                <text key={p.date} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize={11} fill={MUTED}>{p.date.slice(2, 7)}</text>
              ) : null,
            )}
            <circle cx={x(pts.length - 1)} cy={y(last.value)} r={4} fill={LINE} stroke="var(--color-surface)" strokeWidth={2} />
            {h && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--color-line-strong)" strokeWidth={1} />
                <circle cx={x(hover)} cy={y(h.value)} r={4.5} fill={LINE} stroke="var(--color-surface)" strokeWidth={2} />
              </g>
            )}
            <rect
              x={padL}
              y={0}
              width={W - padL - padR}
              height={H}
              fill="transparent"
              onMouseMove={(e) => {
                const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
                const t = (e.clientX - r.left) / r.width
                setHover(Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))))
              }}
            />
          </svg>
          {h && hover !== null && (
            <div className="pointer-events-none absolute top-1 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow" style={{ left: Math.min(Math.max(x(hover) - 50, 0), W - 120) }}>
              <span className="block text-slate-400">{h.date}</span>
              <span className="block font-semibold tabular-nums text-ink">{formatMoney(h.value, series.currency)}</span>
            </div>
          )}
        </div>
      )}
      {series.joinedLater.length > 0 && pts.length >= 2 && (
        <p className="text-xs text-slate-400">
          {series.joinedLater.join(', ')} {series.joinedLater.length === 1 ? 'was' : 'were'} added after the line starts, so it steps up. Steps can also come from new payments in.
        </p>
      )}
    </VizCard>
  )
}
