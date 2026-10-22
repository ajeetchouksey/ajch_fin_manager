import {
  ArrowLeftRight,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  MessageCircleQuestion,
  Lightbulb,
  PiggyBank,
  Receipt,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** Desktop sidebar, top to bottom (design decision D2). */
export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/report', label: 'Reports', icon: ClipboardList },
  { to: '/assistant', label: 'Assistant', icon: MessageCircleQuestion },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** Under "More": pages people open now and then. */
export const MORE_ITEMS: NavItem[] = [
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/tax', label: 'Tax', icon: Receipt },
  { to: '/analysis', label: 'Saved analysis', icon: Sparkles },
  { to: '/trash', label: 'Trash', icon: Trash2 },
]

/** Phone tab bar: Home, Activity, + (add), Budgets, Goals. The rest is in the account menu. */
export const TAB_ITEMS: Array<NavItem | 'add'> = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  'add',
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
]

/** Pages not in the phone tab bar, listed in the account menu on phones. */
export const PHONE_MENU_ITEMS: NavItem[] = [
  ...NAV_ITEMS.filter((n) => !TAB_ITEMS.some((t) => t !== 'add' && t.to === n.to)),
  ...MORE_ITEMS,
]

/** Opens the add-transaction dialog from anywhere. */
export const ADD_TRANSACTION_PATH = '/transactions?add=1'

/** Opens the statement import from anywhere. */
export const IMPORT_PATH = '/transactions?import=1'
