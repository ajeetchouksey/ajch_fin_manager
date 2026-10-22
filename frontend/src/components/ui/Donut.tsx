import type { ReactNode } from 'react'

export interface DonutPart {
  label: string
  value: number
  color: string
}

/**
 * Donut chart with a centre label (design: Budgets "where the money went"). Parts keep the order given;
 * the list next to it is the accessible version, so the SVG itself is hidden from screen readers.
 */
export function Donut({ parts, size = 160, thickness = 18, center }: { parts: DonutPart[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = parts.length > 1 ? 1.5 : 0
  let start = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={thickness} />
        {total > 0 &&
          parts.map((p) => {
            const len = (Math.max(0, p.value) / total) * c
            const dash = `${Math.max(0.5, len - gap)} ${c}`
            const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={thickness} strokeDasharray={dash} strokeDashoffset={-start} />
            start += len
            return el
          })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  )
}
