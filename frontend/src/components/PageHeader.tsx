import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/** Page header (design): accent eyebrow, Barlow Condensed 38px title, actions on the right. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="m-0 font-display text-[32px] leading-[1.1] font-bold tracking-[-0.01em] text-ink sm:text-[38px]">{title}</h1>
        {description && <p className="text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}
