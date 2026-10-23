import { suggestCategory, type SuggestOptions } from './categorize'
import { groupPayees } from './payees'
import type { Direction, Transaction } from './types'

/**
 * What still needs a human (or the user's AI app) to decide: payees whose payments sit in "Other" or
 * have no category. They are grouped by payee so one answer fixes every payment, and each group
 * carries the deterministic category hint when there is one. Nothing is changed here.
 */

const UNRESOLVED = /^(other( income)?)?$/i

export interface UnresolvedPayee {
  label: string
  direction: Direction
  currency: string
  count: number
  total: number
  firstDate: string
  lastDate: string
  /** Up to three different descriptions as they appear in the Ledger */
  samples: string[]
  transactionIds: string[]
  /** What FinBuddy's own rules and history suggest, when they suggest something other than Other */
  hint: { category: string; source: 'history' | 'rule' | 'own-name' } | null
}

export interface UnresolvedOptions extends SuggestOptions {
  /** What FinBuddy has learned from the categories already in the Ledger */
  learned?: Map<string, { category: string; direction: Direction }>
  /** Most groups to return, biggest total first (default 25) */
  limit?: number
}

export function unresolvedPayees(tx: Transaction[], options: UnresolvedOptions = {}): UnresolvedPayee[] {
  const open = tx.filter((t) => UNRESOLVED.test(t.category.trim()) && t.amount > 0)
  const out: UnresolvedPayee[] = []
  for (const direction of ['out', 'in'] as const) {
    for (const g of groupPayees(open.filter((t) => t.direction === direction))) {
      const dates = g.tx.map((t) => t.date.slice(0, 10)).sort()
      const hint = suggestCategory(g.label, direction, options.learned, options)
      out.push({
        label: g.label,
        direction,
        currency: g.tx[0].currency,
        count: g.tx.length,
        total: Math.round(g.tx.reduce((s, t) => s + t.amount, 0) * 100) / 100,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
        samples: [...new Set(g.tx.map((t) => t.description))].slice(0, 3),
        transactionIds: g.tx.map((t) => t.id),
        hint: hint && !UNRESOLVED.test(hint.category) ? { category: hint.category, source: hint.source } : null,
      })
    }
  }
  return out.sort((a, b) => b.total - a.total).slice(0, options.limit ?? 25)
}
