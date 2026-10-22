import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center sm:py-16 ${className}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line-strong bg-brand/10 text-brand-soft">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
