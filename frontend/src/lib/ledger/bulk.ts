import { isTransfer } from './categorize'
import type { Transaction } from './types'

export interface CategoryChange {
  /** The row as it is now: the snapshot undo writes back */
  before: Transaction
  after: Transaction
}

export interface CategoryPlan {
  changes: CategoryChange[]
  /** Already in the chosen category */
  unchanged: number
  /** Money in can only take an income category, and money out an expense one */
  skipped: number
  /** Transfers between own accounts keep their category */
  transfers: number
}

/**
 * What a bulk category change would do, before anything is written.
 * `fits(direction, category)` says whether the category suits money in or money out.
 */
export function planRecategorise(
  txs: Transaction[],
  category: string,
  fits: (direction: Transaction['direction'], category: string) => boolean,
): CategoryPlan {
  const plan: CategoryPlan = { changes: [], unchanged: 0, skipped: 0, transfers: 0 }
  for (const t of txs) {
    if (isTransfer(t)) plan.transfers++
    else if (t.category === category) plan.unchanged++
    else if (!fits(t.direction, category)) plan.skipped++
    else plan.changes.push({ before: t, after: { ...t, category } })
  }
  return plan
}
