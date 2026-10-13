import { useId } from 'react'

interface LogoMarkProps {
  className?: string
  title?: string
}

/** Aarya Finance app mark — rising trend line on the brand violet tile. */
export function LogoMark({ className = 'h-9 w-9', title }: LogoMarkProps) {
  const id = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#5b21b6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-bg)`} />
      <path
        d="M16 44 27 32l8 6 13-16"
        fill="none"
        stroke="#fff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="22" r="4.5" fill="#38bdf8" />
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-8 w-8 shrink-0" />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Aarya <span className="font-medium text-slate-400">Finance</span>
        </span>
      )}
    </span>
  )
}
