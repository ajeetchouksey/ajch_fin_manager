import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  onClose: () => void
  title: string
  subtitle?: ReactNode
  /** Rendered before the title, e.g. a back button. */
  leading?: ReactNode
  /** Rendered between the header and the scrolling body, e.g. a progress bar. */
  toolbar?: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
  /** Desktop: shrink to content instead of a fixed height */
  fitContent?: boolean
  closeLabel?: string
  children: ReactNode
}

/**
 * Responsive dialog:
 *  - phones: full-screen sheet that respects the notch / home indicator (iOS) and gesture bar (Android)
 *  - tablets & desktop (Windows, macOS): centred dialog with a dimmed backdrop
 * Closes on Escape and backdrop click; locks page scroll while open.
 */
export function Dialog({
  onClose,
  title,
  subtitle,
  leading,
  toolbar,
  footer,
  size = 'md',
  fitContent = false,
  closeLabel = 'Close',
  children,
}: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Mount-only: scroll lock, initial focus, Escape handling, focus restore.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [])

  const height = fitContent ? 'sm:h-auto sm:max-h-[min(760px,calc(100dvh-3rem))]' : 'sm:h-[min(760px,calc(100dvh-3rem))]'
  const width = size === 'lg' ? 'sm:max-w-3xl lg:max-w-4xl' : 'sm:max-w-xl'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 hidden bg-slate-950/70 backdrop-blur-sm animate-fade-in sm:block"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-dvh w-full flex-col overflow-hidden bg-surface pt-safe outline-none animate-sheet-in
          ${height} sm:rounded-2xl sm:border sm:border-line-strong sm:pt-0 sm:shadow-2xl sm:shadow-black/50 sm:animate-dialog-in ${width}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5 sm:px-5 sm:py-3.5">
          {leading}
          <div className={`min-w-0 flex-1 ${leading ? '' : 'pl-1 sm:pl-0'}`}>
            <h2 id={titleId} className="truncate text-base font-semibold text-white sm:text-lg">
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-slate-400 sm:text-sm">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn shrink-0" aria-label={closeLabel}>
            <X className="h-5 w-5" />
          </button>
        </header>

        {toolbar}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <footer className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
