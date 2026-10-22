import type { ColorSlug } from './categoryColors'

/**
 * Category groups for stacked charts (design: "where the money went" strip and monthly columns).
 * The big four stay on their own; the rest fold into Bills, Lifestyle and Other so a chart has at most seven parts.
 */

export const CATEGORY_GROUPS = ['Housing', 'Groceries', 'Transport', 'Health', 'Bills', 'Lifestyle', 'Other'] as const
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]

const MEMBERS: Record<Exclude<CategoryGroup, 'Housing' | 'Groceries' | 'Transport' | 'Health'>, string[]> = {
  Bills: ['Utilities', 'Mobile & internet', 'Subscriptions', 'Insurance', 'Fees & charges', 'Taxes', 'Loan & EMI'],
  Lifestyle: ['Travel', 'Dining out', 'Shopping', 'Fitness', 'Personal care', 'Education', 'Entertainment', 'Childcare', 'Pets', 'Gifts & donations'],
  Other: ['Other', 'Cash withdrawal', 'Savings & investments'],
}

/** Colour slot per group (see categoryColors). */
export const GROUP_COLOR: Record<CategoryGroup, ColorSlug> = {
  Housing: 'housing',
  Groceries: 'groceries',
  Transport: 'transport',
  Health: 'health',
  Bills: 'bills',
  Lifestyle: 'travel',
  Other: 'other',
}

export function groupOf(category: string): CategoryGroup {
  if (category === 'Housing' || category === 'Rent') return 'Housing'
  if (category === 'Groceries' || category === 'Transport' || category === 'Health') return category
  for (const [g, list] of Object.entries(MEMBERS)) if (list.includes(category)) return g as CategoryGroup
  return 'Other'
}

/** Sums category amounts into groups, in the fixed group order; empty groups are left out. */
export function groupTotals(rows: Array<{ category: string; amount: number }>): Array<{ group: CategoryGroup; amount: number }> {
  const sums = new Map<CategoryGroup, number>()
  for (const r of rows) sums.set(groupOf(r.category), (sums.get(groupOf(r.category)) ?? 0) + r.amount)
  return CATEGORY_GROUPS.filter((g) => (sums.get(g) ?? 0) > 0).map((g) => ({ group: g, amount: Math.round(sums.get(g)! * 100) / 100 }))
}

/** CSS colour for a group. */
export const groupColor = (g: CategoryGroup) => `var(--color-cat-${GROUP_COLOR[g]})`
