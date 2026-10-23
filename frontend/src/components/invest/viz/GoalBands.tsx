import { useState } from 'react'
import { Link } from 'react-router-dom'
import { goalBand, goalProgress } from '../../../lib/ledger/investViz'
import type { GoalScenario } from '../../../lib/ledger/scenarios'
import { formatMoney } from '../../../lib/ledger/types'
import { compact, pct, TableSwitch, useWidth, VizCard } from './shared'

const MUTED = '#94a3b8'
const CASE_STYLE: Record<string, { color: string; dash?: string }> = {
  flat: { color: 'var(--color-line-strong)', dash: '4 4' },
  modest: { color: 'var(--color-brand-soft)' },
  strong: { color: 'var(--color-good)' },
}

function Ring({ share, size = 64 }: { share: number; size?: number }) {
  const t = 8
  const r = (size - t) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={t} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-brand-soft)" strokeWidth={t} strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-ink">{pct(share, 0)}</span>
    </span>
  )
}

function Band({ s }: { s: GoalScenario }) {
  const [ref, W] = useWidth(320)
  const b = goalBand(s)
  const H = 150
  const padL = 58
  const padR = 8
  const padT = 8
  const padB = 20
  const hi = Math.max(b.target, ...b.series.map((c) => c.values[c.values.length - 1])) * 1.05
  const x = (m: number) => padL + ((W - padL - padR) * m) / Math.max(1, b.months)
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / hi)
  const line = (v: number[]) => v.map((val, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(val).toFixed(1)}`).join(' ')
  const yearsLabel = (m: number) => (m === 0 ? 'now' : `${s.targetDate.slice(0, 4)}`)
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`${s.name}: three illustrative cases against the target of ${formatMoney(s.target, s.currency)}`}>
        {[0, hi / 2, hi].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-track)" strokeWidth={1} />
            <text x={padL - 5} y={y(t) + 4} textAnchor="end" fontSize={10} fill={MUTED}>{compact(t, s.currency)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={y(b.target)} y2={y(b.target)} stroke="var(--color-warn-text)" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={W - padR} y={y(b.target) - 4} textAnchor="end" fontSize={10} fill="var(--color-warn-text)">Target {compact(b.target, s.currency)}</text>
        {b.series.map((c) => (
          <path key={c.id} d={line(c.values)} fill="none" stroke={CASE_STYLE[c.id]?.color ?? 'var(--color-brand-soft)'} strokeWidth={2} strokeDasharray={CASE_STYLE[c.id]?.dash} strokeLinecap="round" />
        ))}
        <text x={padL} y={H - 5} fontSize={10} fill={MUTED}>{yearsLabel(0)}</text>
        <text x={W - padR} y={H - 5} textAnchor="end" fontSize={10} fill={MUTED}>{yearsLabel(b.months)}</text>
      </svg>
    </div>
  )
}

/** Each investing goal: how much is already set aside, and where three illustrative cases end against the target. */
export function GoalBands({ scenarios }: { scenarios: GoalScenario[] }) {
  const [asTable, setAsTable] = useState(false)
  if (scenarios.length === 0) {
    return (
      <VizCard title="Goals" note="Nothing to draw yet. A goal needs a target, a date and an investment or retirement account linked to it.">
        <Link to="/goals" className="text-sm font-semibold text-accent">Set goals</Link>
      </VizCard>
    )
  }
  return (
    <VizCard
      title="Goals against the target"
      note="Three illustrative yearly returns (0%, 3%, 6%) up to each goal date. Cases to compare, not forecasts."
      actions={<TableSwitch on={asTable} onToggle={() => setAsTable((v) => !v)} />}
    >
      <ul className="m-0 flex list-none flex-col gap-5 p-0">
        {scenarios.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Ring share={goalProgress(s)} />
              <span className="min-w-[10rem] flex-1">
                <span className="block font-medium text-ink">{s.name}</span>
                <span className="block text-sm text-slate-400">
                  {formatMoney(s.current, s.currency)} of {formatMoney(s.target, s.currency)} by {s.targetDate.slice(0, 7)}. {formatMoney(s.monthly, s.currency)} a month.
                </span>
              </span>
              <span className="rounded-full bg-tint px-2.5 py-0.5 text-sm font-semibold text-ink">
                {s.neededRate === null ? 'Out of reach' : s.neededRate === 0 ? 'Saving is enough' : `Needs ${pct(s.neededRate)} a year`}
              </span>
            </div>
            {asTable ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="py-1">Case</th><th className="py-1 text-right">On the date</th><th className="py-1 text-right">Short by</th></tr>
                </thead>
                <tbody className="divide-y divide-line text-slate-300">
                  {s.cases.map((c) => (
                    <tr key={c.id}><td className="py-1">{c.label} ({pct(c.rate, 0)})</td><td className="py-1 text-right tabular-nums">{formatMoney(c.value, s.currency)}</td><td className="py-1 text-right tabular-nums">{c.reaches ? 'Reaches it' : formatMoney(c.short, s.currency)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <>
                <Band s={s} />
                <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-slate-300">
                  {s.cases.map((c) => (
                    <li key={c.id} className="flex items-center gap-1.5">
                      <span className="inline-block w-4 border-t-2" style={{ borderColor: CASE_STYLE[c.id]?.color, borderStyle: CASE_STYLE[c.id]?.dash ? 'dashed' : 'solid' }} aria-hidden />
                      {c.label} {pct(c.rate, 0)}: {compact(c.value, s.currency)}
                    </li>
                  ))}
                  <li className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-warn-text" aria-hidden />Target</li>
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>
    </VizCard>
  )
}
