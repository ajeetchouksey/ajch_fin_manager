import type { ReactNode } from 'react'
import { Header } from './Header'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: `
          radial-gradient(ellipse 100% 60% at 50% -5%, rgba(91, 75, 214, 0.22) 0%, transparent 65%),
          radial-gradient(ellipse 70% 50% at 85% 85%, rgba(169, 155, 255, 0.14) 0%, transparent 55%),
          radial-gradient(ellipse 50% 40% at 10% 60%, rgba(91, 75, 214, 0.08) 0%, transparent 50%),
          radial-gradient(ellipse 55% 45% at 100% 45%, rgba(169, 155, 255, 0.10) 0%, transparent 60%),
          radial-gradient(ellipse 45% 35% at 0% 95%, rgba(91, 75, 214, 0.09) 0%, transparent 55%),
          var(--aarya-bg)
        `,
        backgroundAttachment: 'scroll',
      }}
    >
      <Header />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="animate-[fadeIn_0.38s_cubic-bezier(0.22,1,0.36,1)_both]">
          <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-8 lg:px-8">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/30 backdrop-blur-md bg-slate-900/30 mt-auto">
        <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-12 lg:px-8">
          {/* Newsletter CTA */}
          <div
            className="rounded-xl border border-violet-500/20 p-8 mb-12 glass-card"
            style={{ background: 'rgba(139, 92, 246, 0.04)' }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Stay Updated
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Get insights and updates about your finances delivered to your inbox
            </p>
            <form className="flex gap-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-violet-500/30 transition-all"
              >
                Subscribe
              </button>
            </form>
          </div>

          {/* Footer Links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-white text-sm mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Dashboard
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Terms
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Security
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white text-sm mb-4">Connect</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Twitter
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Discord
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div
            className="h-px mb-8"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent)',
            }}
          ></div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <p>© 2026 AaryaAI · MIT License · Built with care</p>
            <div className="flex items-center gap-2">
              <span className="text-slate-600">v1.0.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
