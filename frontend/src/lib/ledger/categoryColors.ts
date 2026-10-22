import { INCOME_CATEGORIES } from './types'
import { TRANSFER_CATEGORY } from './categorize'

/**
 * One fixed colour per category, the same on every chart, list and chip (design system tokens `cat-*`).
 * Components use `categoryColor()`, a CSS variable, so the light theme can swap the values in one place.
 * Income is always green and spending (as a series) always orange; neither is reused for a category.
 */

export type ColorPair = { light: string; dark: string }

export const CATEGORY_PALETTE = {
  housing: { light: '#5b4bd6', dark: '#7c6cf0' },
  health: { light: '#d94f8c', dark: '#f472b6' },
  transport: { light: '#2f7fd1', dark: '#60a5fa' },
  groceries: { light: '#1f9d8b', dark: '#2dd4bf' },
  travel: { light: '#e5a400', dark: '#fbbf24' },
  shopping: { light: '#7a9a2e', dark: '#a3c45a' },
  bills: { light: '#a99bff', dark: '#c4b5fd' },
  utilities: { light: '#9c6b3f', dark: '#c49a6c' },
  subscriptions: { light: '#4fb3d9', dark: '#67e8f9' },
  dining: { light: '#f2a27e', dark: '#fdba74' },
  education: { light: '#6e6a85', dark: '#a8a3c2' },
  fees: { light: '#8a84a3', dark: '#a5a0bd' },
  fitness: { light: '#0e7490', dark: '#22b8cf' },
  savings: { light: '#4d7c0f', dark: '#84cc16' },
  entertainment: { light: '#c026d3', dark: '#e879f9' },
  insurance: { light: '#64748b', dark: '#a3b1c6' },
  personal: { light: '#f472b6', dark: '#f9a8d4' },
  taxes: { light: '#9a3412', dark: '#d9774a' },
  other: { light: '#b8b3c9', dark: '#64748b' },
  income: { light: '#12805c', dark: '#34d399' },
  spending: { light: '#e0752e', dark: '#fb923c' },
  transfer: { light: '#8a84a3', dark: '#94a3b8' },
} satisfies Record<string, ColorPair>

export type ColorSlug = keyof typeof CATEGORY_PALETTE

// Less common categories share a colour with one they rarely appear next to.
const BY_CATEGORY: Record<string, ColorSlug> = {
  Housing: 'housing',
  Rent: 'housing',
  Health: 'health',
  Transport: 'transport',
  Groceries: 'groceries',
  Travel: 'travel',
  Shopping: 'shopping',
  'Mobile & internet': 'bills',
  Utilities: 'utilities',
  Subscriptions: 'subscriptions',
  'Dining out': 'dining',
  Education: 'education',
  Childcare: 'education',
  'Fees & charges': 'fees',
  'Cash withdrawal': 'fees',
  Fitness: 'fitness',
  'Savings & investments': 'savings',
  Entertainment: 'entertainment',
  'Gifts & donations': 'entertainment',
  Insurance: 'insurance',
  'Personal care': 'personal',
  Pets: 'shopping',
  Taxes: 'taxes',
  'Loan & EMI': 'taxes',
  Other: 'other',
  'Everything else': 'other',
}

/** The palette slot for a category; unknown (user-made) categories are grey like Other. */
export function categorySlug(category: string): ColorSlug {
  if (category === TRANSFER_CATEGORY) return 'transfer'
  if (INCOME_CATEGORIES.includes(category)) return 'income'
  return BY_CATEGORY[category] ?? BY_CATEGORY[Object.keys(BY_CATEGORY).find((k) => k.toLowerCase() === category.trim().toLowerCase()) ?? ''] ?? 'other'
}

/** CSS colour for a category, following the active theme. */
export const categoryColor = (category: string) => `var(--color-cat-${categorySlug(category)})`

/** A soft background for chips and avatars: the category colour at low strength. */
export const categoryTint = (category: string, percent = 18) => `color-mix(in srgb, ${categoryColor(category)} ${percent}%, transparent)`

/** The raw hex for a theme, for places that cannot use CSS variables (canvas, exports). */
export const categoryHex = (category: string, theme: 'light' | 'dark' = 'dark') => CATEGORY_PALETTE[categorySlug(category)][theme]

/** CSS custom properties for one theme, e.g. for a `[data-theme]` block or tests. */
export function categoryCssVars(theme: 'light' | 'dark'): Record<string, string> {
  return Object.fromEntries(Object.entries(CATEGORY_PALETTE).map(([k, v]) => [`--color-cat-${k}`, v[theme]]))
}
