import { useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import { Logo, LogoMark } from './Logo'
import { UserMenu } from './UserMenu'
import { useLedger } from '../context/LedgerContext'
import { ADD_TRANSACTION_PATH, IMPORT_PATH, MORE_ITEMS, NAV_ITEMS, TAB_ITEMS, type NavItem } from './navigation'

function SideLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-[10px] px-3 font-medium transition-colors ${
          isActive ? 'bg-tint text-accent' : 'text-slate-300 hover:bg-subtle hover:text-ink'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
      {label}
    </NavLink>
  )
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Desktop and tablet sidebar (design): lockup, navigation, More, import reminder, account. */
export function Sidebar() {
  const { pathname } = useLocation()
  const { transactions } = useLedger()
  const inMore = MORE_ITEMS.some((m) => pathname.startsWith(m.to))
  const [moreOpen, setMoreOpen] = useState(inMore)
  const showMore = moreOpen || inMore
  const lastEntry = useMemo(() => transactions.reduce((m, t) => (t.date > m ? t.date : m), ''), [transactions])

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] print:!hidden flex-col gap-7 border-r border-line bg-surface px-5 pt-7 pb-4 pl-[max(1.25rem,env(safe-area-inset-left))] md:flex">
      <Link to="/dashboard" className="flex items-center gap-2.5 rounded-lg" aria-label="AaryaAI Finance Manager home">
        <LogoMark className="h-10 w-10 shrink-0" />
        <span className="flex flex-col gap-0.5 leading-[1.05]">
          <span className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
            aarya<span className="text-accent">ai</span>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Finance Manager</span>
        </span>
      </Link>

      <nav aria-label="Main" className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
        {NAV_ITEMS.map((n) => (
          <SideLink key={n.to} {...n} />
        ))}
        <button
          type="button"
          aria-expanded={showMore}
          onClick={() => setMoreOpen((o) => !o)}
          className="mt-2 flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 hover:text-ink"
        >
          More
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showMore && MORE_ITEMS.map((n) => <SideLink key={n.to} {...n} />)}
      </nav>

      <div className="flex flex-col gap-2 rounded-[14px] bg-tint p-4">
        <p className="font-semibold text-ink">Import a statement</p>
        <p className="text-sm leading-[1.45] text-slate-400">
          {lastEntry ? `Your ledger runs to ${shortDate(lastEntry)}. Import your next statement when it is ready.` : 'Bring in your bank’s CSV export to get started.'}
        </p>
        <Link to={IMPORT_PATH} className="btn btn-secondary w-full">Upload file</Link>
      </div>

      <div className="-mx-2 border-t border-line pt-3">
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  )
}

/** Phones: top bar with logo and account menu (the sidebar takes over from md up). */
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 pt-safe backdrop-blur-xl md:hidden print:hidden">
      <div className="flex h-14 w-full items-center gap-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        <Link to="/dashboard" className="shrink-0 rounded-lg" aria-label="AaryaAI Finance home">
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-safe pl-safe pr-safe backdrop-blur-xl md:hidden print:hidden"
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
                    isActive ? 'text-accent' : 'text-slate-400 active:text-slate-300'
                  }`
                }
              >
                <item.icon className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
