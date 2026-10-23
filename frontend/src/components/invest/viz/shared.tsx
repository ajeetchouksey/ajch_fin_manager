import { useEffect, useRef, useState, type ReactNode } from 'react'
import { moneyLocale } from '../../../lib/ledger/money'
import { privately } from '../../../lib/ledger/privacy'

/** Width of the element the ref is attached to, kept up to date as it resizes. */
export function useWidth(initial = 560) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(220, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  })
  return [ref, width] as const
}

export function compact(n: number, currency: string) {
  try {
    return privately(new Intl.NumberFormat(moneyLocale(currency), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n))
  } catch {
    return `${Math.round(n)} ${currency}`
  }
}

export const pct = (v: number, digits = 1) => `${Math.round(v * 10 ** (2 + digits)) / 10 ** digits}%`

/** One colour per kind of holding, in a fixed order that passes a colour-blind check; text never wears these. */
export const CLASS_COLOR: Record<string, string> = {
  funds: 'var(--color-viz-1)',
  shares: 'var(--color-viz-2)',
  gold: 'var(--color-viz-3)',
  crypto: 'var(--color-viz-4)',
  retirement: 'var(--color-viz-5)',
}

/** A card for one chart: title, a one-line takeaway, and an optional table switch. */
export function VizCard({ title, note, actions, children }: { title: string; note?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="card-title">{title}</h3>
          {note && <p className="text-sm text-slate-400">{note}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function TableSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="text-xs font-medium text-brand-soft hover:text-ink print:hidden" onClick={onToggle}>
      {on ? 'Show chart' : 'Show as table'}
    </button>
  )
}
