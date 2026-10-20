/**
 * Monthly budgets per spending category: the Budgets tab of the Ledger, and how a period is doing
 * against them. Works for calendar months and salary cycles alike, through the same date ranges.
 */
import { isTransfer } from './categorize'
import { inSpan, type Span } from './summary'
import type { Transaction } from './types'
import { parseNumber } from './money'

export const BUDGET_COLUMNS = ['category', 'monthly', 'currency', 'created_at'] as const

/** Share of a budget at which it starts to look tight. */
export const BUDGET_WARN_AT = 0.8

export interface Budget {
  /** Spending category; also the row key in the Budgets tab */
  category: string
  /** Limit for one period (a month or a salary cycle), in `currency` */
  monthly: number
  currency: string
  createdAt: string
  /** 1-based sheet row, for edits and deletes (not stored) */
  row?: number
}

export type BudgetState = 'ok' | 'warn' | 'over'

export interface BudgetProgress {
  category: string
  limit: number
  spent: number
  /** spent / limit (can be above 1) */
  used: number
  /** limit − spent; negative when over */
  remaining: number
  state: BudgetState
}

export function budgetToRow(b: Budget): (string | number)[] {
  return [b.category, b.monthly, b.currency, b.createdAt]
}

export function rowToBudget(r: unknown[], row: number): Budget | null {
  const category = String(r[0] ?? '').trim()
  if (!category) return null
  const parsed = parseNumber(r[1] as string | number)
  if (parsed === null) return null
  const monthly = Math.abs(parsed)
  return { category, monthly, currency: String(r[2] ?? '').trim().toUpperCase() || 'EUR', createdAt: String(r[3] ?? ''), row }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * How each budget is doing in a period, most used first. Only money out in the budget's currency
 * counts; transfers between the user's own accounts never do.
 */
export function budgetProgress(budgets: Budget[], transactions: Transaction[], span: Span, currency: string): BudgetProgress[] {
  const spentBy = new Map<string, number>()
  for (const t of transactions) {
    if (t.direction !== 'out' || t.currency !== currency || !inSpan(t.date, span) || isTransfer(t)) continue
    const k = t.category || 'Other'
    spentBy.set(k, (spentBy.get(k) ?? 0) + t.amount)
  }
  return budgets
    .filter((b) => b.currency === currency && b.monthly > 0)
    .map((b) => {
      const spent = r2(spentBy.get(b.category) ?? 0)
      const used = spent / b.monthly
      const state: BudgetState = used > 1 ? 'over' : used >= BUDGET_WARN_AT ? 'warn' : 'ok'
      return { category: b.category, limit: b.monthly, spent, used, remaining: r2(b.monthly - spent), state }
    })
    .sort((a, b) => b.used - a.used)
}
