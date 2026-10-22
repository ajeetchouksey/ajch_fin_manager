import type { ReactNode } from 'react'
import { Header, Sidebar, TabBar } from './Header'
import { SlashCommandPalette } from './SlashCommandPalette'
import { InstallBanner } from './InstallBanner'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* AaryaAI ambient glow (same layers as ajch_platform body) — fixed so it doesn't repaint on scroll */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 100% 60% at 50% -5%, rgba(91,75,214,0.22) 0%, transparent 65%), radial-gradient(ellipse 70% 50% at 85% 85%, rgba(169,155,255,0.14) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 10% 60%, rgba(91,75,214,0.08) 0%, transparent 50%), radial-gradient(ellipse 55% 45% at 100% 45%, rgba(169,155,255,0.10) 0%, transparent 60%), radial-gradient(ellipse 45% 35% at 0% 95%, rgba(91,75,214,0.09) 0%, transparent 55%)',
        }}
      />

      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-60">
      <Header />
      <InstallBanner />

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
      </div>

      <TabBar />
      <SlashCommandPalette />
    </div>
  )
}
