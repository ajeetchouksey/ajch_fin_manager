import { Navigate } from 'react-router-dom'
import { BarChart3, MessagesSquare, ShieldCheck, Target } from 'lucide-react'
import { getGoogleAuthUrl } from '../utils/oauth'
import { useAuth } from '../hooks/useAuth'
import { Logo } from '../components/Logo'
import { AI_ENABLED } from '../config'

const ALL_FEATURES = [
  { icon: BarChart3, title: 'Everything in one view', text: 'Accounts, spending and savings side by side.' },
  { icon: MessagesSquare, title: 'An assistant that knows your setup', text: 'Ask Aarya questions in plain language.' },
  { icon: Target, title: 'Goals with a plan', text: 'See what it takes to reach each one, and when.' },
]
const FEATURES = ALL_FEATURES.filter((f) => AI_ENABLED || f.icon !== MessagesSquare)

export function LoginPage() {
  const { isAuthenticated, loading, error } = useAuth()
  if (!loading && isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="relative flex min-h-dvh flex-col lg:flex-row">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 100% 60% at 50% -5%, rgba(91,75,214,0.22) 0%, transparent 65%), radial-gradient(ellipse 70% 50% at 85% 85%, rgba(169,155,255,0.14) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 10% 60%, rgba(91,75,214,0.08) 0%, transparent 50%), radial-gradient(ellipse 55% 45% at 100% 45%, rgba(169,155,255,0.10) 0%, transparent 60%), radial-gradient(ellipse 45% 35% at 0% 95%, rgba(91,75,214,0.09) 0%, transparent 55%)' }}
      />

      {/* Brand panel — desktop/tablet landscape only */}
      <aside className="hidden flex-1 flex-col justify-between border-r border-line p-12 lg:flex xl:p-16">
        <Logo />
        <div className="max-w-md">
          <p className="eyebrow mb-3">AaryaAI Finance</p>
          <h2 className="text-5xl font-semibold leading-[1.05] text-white">
            Your money, <span className="heading-gradient">clearly organised.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} AaryaAI</p>
      </aside>

      {/* Sign-in */}
      <main className="flex flex-1 flex-col items-center justify-center pt-safe pb-safe pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-12">
        <div className="w-full max-w-sm py-12 animate-fade-in">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="mt-10 text-[34px] leading-tight font-semibold text-white lg:mt-0">
            Sign in to <span className="heading-gradient">Finance</span>
          </h1>
          <p className="mt-2 text-base text-slate-400">{AI_ENABLED ? 'Track spending, plan goals and get answers about your money.' : 'Track spending and plan your goals in one place.'}</p>

          {error && (
            <p role="status" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => (window.location.href = getGoogleAuthUrl())}
            className="btn mt-10 h-12 w-full border border-slate-300 bg-white text-base font-semibold text-slate-800 hover:bg-slate-100"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="mt-8 flex gap-3 rounded-2xl border border-line bg-surface/60 p-4 text-sm text-slate-400">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-success" strokeWidth={1.75} />
            <p>
              Aarya only sees the files it creates in your Google Drive, such as your Ledger and the documents you upload. It
              never reads the rest of your Drive. You can revoke it at any time from your Google Account.
            </p>
          </div>

          {/* Feature list for phones/tablets in portrait */}
          <ul className="mt-10 space-y-4 lg:hidden">
            {FEATURES.map(({ icon: Icon, title }) => (
              <li key={title} className="flex items-center gap-3 text-sm text-slate-300">
                <Icon className="h-[18px] w-[18px] text-brand-soft" strokeWidth={1.75} />
                {title}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}
