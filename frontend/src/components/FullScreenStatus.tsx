import type { ReactNode } from 'react'
import { LogoMark } from './Logo'

interface FullScreenStatusProps {
  title: string
  description?: ReactNode
  tone?: 'loading' | 'error'
}

export function FullScreenStatus({ title, description, tone = 'loading' }: FullScreenStatusProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center" role="status" aria-live="polite">
      <div className="relative">
        <LogoMark className="h-14 w-14" />
        {tone === 'loading' && (
          <span className="absolute -inset-2 animate-spin rounded-[22px] border-2 border-transparent border-t-brand-soft" />
        )}
      </div>
      <h1 className="mt-8 text-2xl font-semibold text-ink">{title}</h1>
      {description && (
        <p className={`mt-1.5 max-w-sm text-sm ${tone === 'error' ? 'text-rose-300' : 'text-slate-400'}`}>{description}</p>
      )}
    </div>
  )
}
