import { Link, NavLink } from 'react-router-dom'
import { Logo } from './Logo'
import { UserMenu } from './UserMenu'
import { NAV_ITEMS } from './navigation'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 pt-safe backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:h-16 lg:px-8">
        <Link to="/dashboard" className="shrink-0 rounded-lg" aria-label="AaryaAI Finance home">
          <Logo />
        </Link>

        {/* Desktop & tablet: inline navigation */}
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${
                  isActive ? 'bg-brand/15 text-brand-tint' : 'text-slate-400 hover:bg-slate-800/70 hover:text-ink'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

/** Phones: bottom tab bar, the pattern people expect on iOS and Android. */
export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 pb-safe pl-safe pr-safe backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-ink' : 'text-slate-500 active:text-slate-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-[22px] w-[22px] ${isActive ? 'text-brand-soft' : ''}`} strokeWidth={isActive ? 2.1 : 1.75} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
