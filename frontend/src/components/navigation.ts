import { ArrowLeftRight, ClipboardList, FileText, LayoutDashboard, Lightbulb, Sparkles, Target, Wallet, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/insights', label: 'Insights', icon: Lightbulb },
  { to: '/report', label: 'Report', icon: ClipboardList },
  { to: '/analysis', label: 'Analysis', icon: Sparkles },
]
