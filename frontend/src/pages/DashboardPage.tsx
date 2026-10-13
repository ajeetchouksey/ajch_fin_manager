import { Layout } from '../components/Layout'
import { StatsCard } from '../components/StatsCard'

export function DashboardPage() {
  // Placeholder data - will be replaced with actual API calls
  const stats = [
    {
      label: 'Total Balance',
      value: '$24,582.50',
      subValue: 'Across all accounts',
      trend: 'up' as const,
      trendPercent: 12.5,
      variant: 'default' as const,
    },
    {
      label: 'This Month',
      value: '$3,420',
      subValue: 'Income earned',
      trend: 'up' as const,
      trendPercent: 8.2,
      variant: 'success' as const,
    },
    {
      label: 'Expenses',
      value: '$2,150',
      subValue: 'This month',
      trend: 'down' as const,
      trendPercent: 3.1,
      variant: 'default' as const,
    },
    {
      label: 'Goals Progress',
      value: '64%',
      subValue: 'On track',
      variant: 'success' as const,
    },
  ]

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <p className="page-eyebrow">Welcome back</p>
        <h1 className="text-4xl font-bold text-white">
          Your <span className="heading-gradient">Financial</span> Dashboard
        </h1>
        <p className="text-slate-400 mt-2">
          Track your finances and achieve your goals with AaryaAI
        </p>
      </div>

      {/* Summary Stats Grid */}
      <section className="mb-12">
        <h2 className="section-heading mb-6">Financial Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, idx) => (
            <StatsCard
              key={idx}
              label={stat.label}
              value={stat.value}
              subValue={stat.subValue}
              trend={stat.trend}
              trendPercent={stat.trendPercent}
              variant={stat.variant}
            />
          ))}
        </div>
      </section>

      {/* Accounts Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="section-heading">Your Accounts</h2>
          <button className="px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all">
            + Add Account
          </button>
        </div>

        <div className="glass-card glass-sheen glass-edge p-6">
          <div className="text-center py-12">
            <div className="text-slate-400 mb-4">
              <svg
                className="w-12 h-12 mx-auto opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6v6m0 0v6m0-6h6m0 0h6m0 0h-6m0-6h-6"
                />
              </svg>
            </div>
            <p className="text-slate-400">
              No accounts yet. Start by adding your first account.
            </p>
          </div>
        </div>
      </section>

      {/* Transactions Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="section-heading">Recent Transactions</h2>
          <a
            href="/transactions"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            View all →
          </a>
        </div>

        <div className="glass-card glass-sheen glass-edge overflow-hidden">
          <div className="divide-y divide-slate-700/20">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="p-4 hover:bg-slate-700/10 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Transaction {idx}
                    </p>
                    <p className="text-xs text-slate-500">Today</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">-$45.50</p>
                    <p className="text-xs text-slate-500">Shopping</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Goals Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="section-heading">Financial Goals</h2>
          <button className="px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all">
            + Create Goal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2].map((idx) => (
            <div key={idx} className="glass-card glass-sheen glass-edge p-6">
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-400 mb-1">
                  Goal {idx}
                </p>
                <p className="text-lg font-bold text-white">$5,000</p>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Progress</span>
                  <span>60%</span>
                </div>
                <div className="w-full h-2 bg-slate-700/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all"
                    style={{ width: '60%' }}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Target: Jan 2027 · $3,000 saved
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-12">
        <h2 className="section-heading mb-6">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Add Transaction', icon: '➕' },
            { label: 'View Analytics', icon: '📊' },
            { label: 'Export Report', icon: '📄' },
            { label: 'Settings', icon: '⚙️' },
          ].map((action, idx) => (
            <button
              key={idx}
              className="glass-card glass-sheen glass-edge p-4 text-center group hover:scale-105 transition-transform"
            >
              <div className="text-2xl mb-2">{action.icon}</div>
              <p className="text-xs font-medium text-white group-hover:text-violet-300 transition-colors">
                {action.label}
              </p>
            </button>
          ))}
        </div>
      </section>
    </Layout>
  )
}
