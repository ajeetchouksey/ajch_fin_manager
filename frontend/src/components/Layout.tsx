import type { ReactNode } from 'react'
import { Header, Sidebar, TabBar } from './Header'
import { SlashCommandPalette } from './SlashCommandPalette'
import { InstallBanner } from './InstallBanner'

interface LayoutProps {
  children: ReactNode
}

/** App shell (design): solid sidebar on desktop, top bar + tab bar on phones, plain paper background. */
export function Layout({ children }: LayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-[232px] print:pl-0">
        <Header />
        <InstallBanner />

        <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] md:pb-0">
          <div className="mx-auto w-full max-w-[1280px] pt-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-fade-in sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] md:px-10 md:pt-8 md:pb-12">
            {children}
          </div>
        </main>
      </div>

      <TabBar />
      <SlashCommandPalette />
    </div>
  )
}
