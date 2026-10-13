interface LogoMarkProps {
  className?: string
  title?: string
  /** "solid": indigo hexagon (favicon/app icon style). "outline": lilac outline (header lockup style). */
  variant?: 'solid' | 'outline'
}

/**
 * Official AaryaAI mark — same geometry as ajch_platform public/favicon.svg
 * and logo-horizontal-dark.svg. Do not redraw; change both repos together.
 */
export function LogoMark({ className = 'h-9 w-9', title, variant = 'solid' }: LogoMarkProps) {
  const solid = variant === 'solid'
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M32 2 L58 17 V47 L32 62 L6 47 V17 Z"
        fill={solid ? '#5b4bd6' : 'none'}
        stroke={solid ? 'none' : '#a99bff'}
        strokeWidth={solid ? 0 : 2.5}
      />
      <g
        stroke="#f2f2f3"
        strokeWidth={solid ? 4.2 : 3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M19 50 L32 25 L45 50" />
        <path d="M23 41 H41" />
        <path d="M22 12 L32 22 L42 12" />
      </g>
      <circle cx="32" cy={solid ? 15.5 : 16} r={solid ? 3.6 : 3.2} fill={solid ? '#f2f2f3' : '#a99bff'} />
    </svg>
  )
}

/** Horizontal lockup: mark + "aaryaai" wordmark (Barlow Condensed) + product name. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark variant="outline" className="h-8 w-8 shrink-0" />
      {!compact && (
        <span className="flex items-baseline gap-2.5">
          <span className="font-display text-[26px] leading-none font-semibold tracking-[-0.02em] text-brand-paper">
            aarya<span className="text-brand-lilac">ai</span>
          </span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 min-[380px]:inline">
            Finance
          </span>
        </span>
      )}
    </span>
  )
}
