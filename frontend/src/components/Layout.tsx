import type { ReactNode } from 'react'
import { Header, TabBar } from './Header'
import { SlashCommandPalette } from './SlashCommandPalette'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Soft brand glow — fixed so it doesn't repaint on scroll */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 40% at 50% -10%, rgb(124 58 237 / 0.18), transparent 70%), radial-gradient(40% 30% at 100% 100%, rgb(56 189 248 / 0.06), transparent 70%)',
        }}
      />

      <Header />

      <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] md:pb-0">
        <div className="mx-auto w-full max-w-6xl pt-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-fade-in sm:pt-8 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-8 lg:pt-10">
          {children}
        </div>
      </main>

      <footer className="hidden md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-slate-500 lg:px-8">
          <span>© {new Date().getFullYear()} AaryaAI</span>
          <span className="hidden pointer-fine:inline">
            Press <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-sans text-[11px] text-slate-400">/</kbd> for quick actions
          </span>
        </div>
      </footer>

      <TabBar />
      <SlashCommandPalette />
    </div>
  )
}
