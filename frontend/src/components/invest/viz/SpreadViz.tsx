import { Link } from 'react-router-dom'
import { Donut } from '../../ui/Donut'
import type { Allocation } from '../../../lib/ledger/allocation'
import { formatMoney } from '../../../lib/ledger/types'
import { CLASS_COLOR, pct, VizCard } from './shared'

/** How the money is spread by kind, as a donut and, where a target is set, a bar per kind with the target marked. */
export function SpreadViz({ allocation, drift }: { allocation: Allocation; drift: string[] }) {
  const lines = allocation.lines.filter((l) => l.value > 0 || l.target !== undefined)
  const hasTarget = lines.some((l) => l.target !== undefined)
  const parts = lines.filter((l) => l.value > 0).map((l) => ({ label: l.label, value: l.value, color: CLASS_COLOR[l.id] ?? 'var(--color-viz-1)' }))
  const top = [...lines].sort((a, b) => b.share - a.share)[0]

  return (
    <VizCard
      title="How it is spread"
      note={top ? `${top.label} is the largest part, ${pct(top.share, 0)} of ${formatMoney(allocation.total, allocation.currency)}.` : undefined}
    >
      <div className="flex flex-wrap items-center gap-6">
        <Donut
          parts={parts}
          size={150}
          thickness={20}
          center={
            <>
              <span className="text-xs text-slate-400">Total</span>
              <span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(allocation.total, allocation.currency)}</span>
            </>
          }
        />
        <ul className="m-0 flex min-w-[14rem] flex-1 list-none flex-col gap-3 p-0">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLOR[l.id] }} aria-hidden />
                  {l.label}
                </span>
                <span className="tabular-nums text-slate-300">{pct(l.share, 0)}</span>
              </span>
              <span className="relative block h-2 rounded-full bg-tint" role="img" aria-label={`${l.label}: ${pct(l.share, 0)}${l.target !== undefined ? `, target ${l.target}%` : ''}`}>
                <span className="absolute left-0 top-0 block h-full rounded-full" style={{ width: `${Math.min(100, l.share * 100)}%`, background: CLASS_COLOR[l.id] }} />
                {l.target !== undefined && <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `calc(${Math.min(100, l.target)}% - 1px)` }} aria-hidden />}
              </span>
              {l.target !== undefined && (
                <span className={`text-xs ${l.flagged ? 'text-warn-text' : 'text-slate-400'}`}>
                  Target {l.target}%{l.flagged && l.drift !== undefined ? `, ${Math.abs(Math.round(l.drift))} points ${l.drift > 0 ? 'above' : 'below'}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {!hasTarget && (
        <p className="text-sm text-slate-400">
          Set a target mix to see how far each part has drifted. <Link to="/invest?tab=holdings" className="font-semibold text-accent">Set a target</Link>
        </p>
      )}
      {drift.length > 0 && <p className="text-xs text-slate-400">The black tick on each bar is your target.</p>}
    </VizCard>
  )
}
