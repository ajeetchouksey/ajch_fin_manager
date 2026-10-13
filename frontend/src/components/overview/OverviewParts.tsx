import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Paperclip } from 'lucide-react'
import { formatMoney, type Transaction } from '../../lib/ledger/types'
import { change, monthName, type AccountFlow, type CategoryShare, type MonthTotals, type TrendPoint } from '../../lib/ledger/summary'

const IN = 'var(--color-viz-in)'
const OUT = 'var(--color-viz-out)'

function compact(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n)
  } catch {
    return `${Math.round(n)} ${currency}`
  }
}

export function SectionHeader({ id, title, to, linkLabel = 'View all' }: { id: string; title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5 sm:px-6">
      <h2 id={id} className="text-xl font-semibold text-white">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-soft hover:text-white pointer-fine:min-h-0">
          {linkLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

function Delta({ now, before, goodWhenUp }: { now: number; before: number; goodWhenUp: boolean }) {
  const c = change(now, before)
  if (c === null) return <span className="text-slate-500">No data last month</span>
  if (Math.abs(c) < 0.005) return <span className="text-slate-400">Same as last month</span>
  const up = c > 0
  const good = up === goodWhenUp
  return (
    <span className={good ? 'text-slate-300' : 'text-amber-200'}>
      {up ? '▲' : '▼'} {Math.abs(c * 100).toFixed(0)}% vs last month
    </span>
  )
}

/** Three headline numbers for the month. Each is a stat tile, not a chart. */
export function KpiTiles({ now, before, currency }: { now: MonthTotals; before: MonthTotals; currency: string }) {
  const tiles = [
    { label: 'Money in', value: formatMoney(now.income, currency), swatch: IN, delta: <Delta now={now.income} before={before.income} goodWhenUp /> },
    { label: 'Money out', value: formatMoney(now.spending, currency), swatch: OUT, delta: <Delta now={now.spending} before={before.spending} goodWhenUp={false} /> },
    {
      label: now.net >= 0 ? 'Left over' : 'Overspent',
      value: formatMoney(Math.abs(now.net), currency),
      swatch: null,
      delta: <span className="text-slate-400">{now.count} {now.count === 1 ? 'transaction' : 'transactions'}</span>,
    },
  ]
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="card px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-400">
            {t.swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.swatch }} aria-hidden />}
            {t.label}
          </p>
          <p className="mt-1 font-display text-[32px] leading-tight font-semibold tabular-nums text-white">{t.value}</p>
          <p className="mt-0.5 text-xs">{t.delta}</p>
        </div>
      ))}
    </div>
  )
}

/** Spending by category: one series, so one hue; sorted bars with values as text. */
export function CategoryBars({ rows, currency, onPick }: { rows: CategoryShare[]; currency: string; onPick?: (category: string) => void }) {
  if (!rows.length) return <p className="px-5 py-10 text-center text-sm text-slate-400 sm:px-6">No spending recorded for this month.</p>
  const max = Math.max(...rows.map((r) => r.amount))
  return (
    <ul className="space-y-3 px-5 py-4 sm:px-6">
      {rows.map((r) => (
        <li key={r.category}>
          <button
            type="button"
            disabled={!onPick || r.category === 'Everything else'}
            onClick={() => onPick?.(r.category)}
            className="group w-full text-left disabled:cursor-default"
            title={`${r.category}: ${formatMoney(r.amount, currency)} · ${(r.share * 100).toFixed(0)}% · ${r.count} transactions`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-200 group-enabled:group-hover:text-white">{r.category}</span>
              <span className="shrink-0 tabular-nums text-slate-300">
                {formatMoney(r.amount, currency)} <span className="text-slate-500">· {(r.share * 100).toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5">
              <div className="h-2 rounded-full transition-[width]" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%`, background: OUT }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function barPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

/** Money in vs out for the last months: two series, legend + hover tooltip + table view. */
export function TrendChart({ points, currency, selected, onSelect }: { points: TrendPoint[]; currency: string; selected: string; onSelect: (month: string) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  // Draw at the real pixel width so text stays readable on phones (no viewBox scaling)
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(600)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [asTable])
  const H = Math.round(Math.min(300, Math.max(200, W * 0.55)))
  const padL = 52
  const padB = 26
  const padT = 10
  const plotH = H - padB - padT
  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.spending]))
  const nice = (() => {
    const pow = 10 ** Math.floor(Math.log10(max))
    const steps = [1, 2, 2.5, 5, 10].map((s) => s * pow)
    return steps.find((s) => s >= max) ?? max
  })()
  const y = (v: number) => padT + plotH - (v / nice) * plotH
  const groupW = (W - padL) / points.length
  const barW = Math.min(26, (groupW - 18) / 2)
  const hovered = hover !== null ? points[hover] : null

  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-sm text-slate-300" aria-hidden={asTable}>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: IN }} />Money in</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT }} />Money out</span>
        </div>
        <button type="button" className="text-xs font-medium text-brand-soft hover:text-white" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="py-1.5">Month</th><th className="py-1.5 text-right">In</th><th className="py-1.5 text-right">Out</th><th className="py-1.5 text-right">Net</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.month} className={p.month === selected ? 'text-white' : 'text-slate-300'}>
                <td className="py-1.5">{monthName(p.month)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(p.income, currency)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(p.spending, currency)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(p.net, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" ref={boxRef}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`Money in and out for the last ${points.length} months, in ${currency}`}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={padL} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="rgb(148 163 184 / 0.14)" strokeWidth={1} />
                <text x={padL - 8} y={y(nice * f) + 4} textAnchor="end" fontSize={12} fill="rgb(148 163 184)">{compact(nice * f, currency)}</text>
              </g>
            ))}
            {points.map((p, i) => {
              const gx = padL + i * groupW
              const cx = gx + groupW / 2
              const active = hover === i || (hover === null && p.month === selected)
              return (
                <g key={p.month}>
                  {active && <rect x={gx + 4} y={padT} width={groupW - 8} height={plotH} rx={6} fill="rgb(148 163 184 / 0.07)" />}
                  <path d={barPath(cx - barW - 1, y(p.income), barW, y(0) - y(p.income), 4)} fill={IN} />
                  <path d={barPath(cx + 1, y(p.spending), barW, y(0) - y(p.spending), 4)} fill={OUT} />
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={13} fill={p.month === selected ? 'white' : 'rgb(148 163 184)'} fontWeight={p.month === selected ? 600 : 400}>
                    {monthName(p.month, 'short')}
                  </text>
                  <rect
                    x={gx}
                    y={0}
                    width={groupW}
                    height={H}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${monthName(p.month)}: in ${formatMoney(p.income, currency)}, out ${formatMoney(p.spending, currency)}. Show this month.`}
                    className="cursor-pointer outline-none"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    onClick={() => {
                      setHover(null)
                      onSelect(p.month)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setHover(null)
                        onSelect(p.month)
                      }
                    }}
                  />
                </g>
              )
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 w-44 rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs shadow-xl shadow-black/40"
              style={{ left: `clamp(0px, calc(${((padL + (hover + 0.5) * groupW) / W) * 100}% - 88px), calc(100% - 176px))` }}
            >
              <p className="mb-1 font-semibold text-white">{monthName(hovered.month)}</p>
              <p className="flex justify-between text-slate-300"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: IN }} />In</span><span className="tabular-nums">{formatMoney(hovered.income, currency)}</span></p>
              <p className="flex justify-between text-slate-300"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: OUT }} />Out</span><span className="tabular-nums">{formatMoney(hovered.spending, currency)}</span></p>
              <p className="mt-1 flex justify-between border-t border-line pt-1 text-white"><span>Net</span><span className="tabular-nums">{formatMoney(hovered.net, currency)}</span></p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RecentList({ items }: { items: Transaction[] }) {
  if (!items.length) return <p className="px-5 py-10 text-center text-sm text-slate-400 sm:px-6">Nothing recorded this month.</p>
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.direction === 'in' ? 'bg-brand-success/15 text-brand-success' : 'bg-white/5 text-slate-300'}`}>
            {t.direction === 'in' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-medium text-white">{t.description}</span>
              {t.documentIds.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-label="Has documents" />}
            </span>
            <span className="block truncate text-xs text-slate-400">{t.date} · {t.category}{t.notes ? ` · ${t.notes}` : ''}</span>
          </span>
          <span className={`shrink-0 font-semibold tabular-nums ${t.direction === 'in' ? 'text-brand-success' : 'text-white'}`}>{formatMoney(t.amount, t.currency, t.direction)}</span>
        </li>
      ))}
    </ul>
  )
}

export function AccountList({ rows, currency }: { rows: AccountFlow[]; currency: string }) {
  if (!rows.length) return <p className="px-5 py-10 text-center text-sm text-slate-400 sm:px-6">No account activity this month.</p>
  return (
    <ul className="divide-y divide-line">
      {rows.map((a) => {
        const net = a.income - a.spending
        return (
          <li key={a.account} className="flex items-center gap-3 px-5 py-3 sm:px-6">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-white">{a.account}</span>
              <span className="block text-xs text-slate-400">
                In {formatMoney(a.income, currency)} · Out {formatMoney(a.spending, currency)} · {a.count} {a.count === 1 ? 'transaction' : 'transactions'}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{net >= 0 ? '+' : '−'}{formatMoney(Math.abs(net), currency)}</span>
          </li>
        )
      })}
    </ul>
  )
}
