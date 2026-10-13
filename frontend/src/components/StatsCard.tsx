import type { ReactNode } from 'react'

interface StatsCardProps {
  icon?: ReactNode
  label: string
  value: string | number
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  trendPercent?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export function StatsCard({
  icon,
  label,
  value,
  subValue,
  trend,
  trendPercent,
  variant = 'default',
}: StatsCardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-400'
      case 'down':
        return 'text-red-400'
      default:
        return 'text-slate-400'
    }
  }

  const getVariantColor = () => {
    switch (variant) {
      case 'success':
        return 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20'
      case 'warning':
        return 'bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20'
      case 'danger':
        return 'bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20'
      default:
        return ''
    }
  }

  return (
    <div className={`glass-stats glass-sheen glass-edge p-6 ${getVariantColor()}`}>
      {icon && (
        <div className="mb-4 text-3xl opacity-80">
          {icon}
        </div>
      )}

      <div className="text-sm font-medium text-slate-400 mb-2">
        {label}
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <div className="text-2xl font-bold text-white">
            {value}
          </div>
          {subValue && (
            <div className="text-xs text-slate-500 mt-1">
              {subValue}
            </div>
          )}
        </div>

        {trend && trendPercent !== undefined && (
          <div className={`text-sm font-semibold ${getTrendColor()} whitespace-nowrap`}>
            <span>{trend === 'up' ? '↑' : '↓'}</span>
            <span className="ml-1">{Math.abs(trendPercent)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}
