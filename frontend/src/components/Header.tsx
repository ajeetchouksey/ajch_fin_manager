import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import { Logo } from './Logo'
import { UserMenu } from './UserMenu'
import { ADD_TRANSACTION_PATH, MORE_ITEMS, NAV_ITEMS, TAB_ITEMS, type NavItem } from './navigation'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
    isActive ? 'bg-brand/15 text-brand-tint' : 'text-slate-400 hover:bg-wash/5 hover:text-ink'
  }`

function SideLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink to={to} className={linkClass}>
      {({ isActive }) => (
        <>
          <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-soft' : ''}`} strokeWidth={isActive ? 2.1 : 1.75} aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  )
}

/** Desktop and tablet: fixed sidebar (design decision D2). */
export function Sidebar() {
  const { pathname } = useLocation()
  const inMore = MORE_ITEMS.some((m) => pathname.startsWith(m.to))
  const [moreOpen, setMoreOpen] = useState(inMore)
  const showMore = moreOpen || inMore

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-canvas/80 pt-safe pl-safe backdrop-blur-xl md:flex">
      <Link to="/dashboard" className="mx-4 mt-5 mb-6 rounded-lg" aria-label="AaryaAI Finance home">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-6">
        {NAV_ITEMS.map((n) => (
          <SideLink key={n.to} {...n} />
        ))}
        <button
          type="button"
          aria-expanded={showMore}
          onClick={() => setMoreOpen((o) => !o)}
          className="mt-3 flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 hover:text-ink"
        >
          More
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showMore && MORE_ITEMS.map((n) => <SideLink key={n.to} {...n} />)}
      </nav>
      <div className="border-t border-line p-3">
        <Link to={ADD_TRANSACTION_PATH} className="btn btn-primary w-full">
          <Plus className="h-4 w-4" aria-hidden /> Add transaction
        </Link>
      </div>
    </aside>
  )
}

/** Top bar: logo on phones; the account menu everywhere. */
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 pt-safe backdrop-blur-xl backdrop-saturate-150 md:border-b-0 md:bg-transparent md:backdrop-blur-none">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:h-16 lg:px-8">
        <Link to="/dashboard" className="shrink-0 rounded-lg md:hidden" aria-label="AaryaAI Finance home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

/** Phones: bottom tab bar with Home, Activity, +, Budgets, Goals. */
export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 pb-safe pl-safe pr-safe backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TAB_ITEMS.map((item) =>
          item === 'add' ? (
            <li key="add" className="flex items-center justify-center">
              <Link
                to={ADD_TRANSACTION_PATH}
                aria-label="Add transaction"
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30 active:bg-brand-strong"
              >
                <Plus className="h-6 w-6" strokeWidth={2.2} aria-hidden />
              </Link>
            </li>
          ) : (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-ink' : 'text-slate-500 active:text-slate-300'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={`h-[22px] w-[22px] ${isActive ? 'text-brand-soft' : ''}`} strokeWidth={isActive ? 2.1 : 1.75} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
