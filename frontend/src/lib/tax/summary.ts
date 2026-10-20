/**
 * Tax year summary from the user's own ledger, and deduction suggestions. Suggestions are only proposals:
 * the user confirms each one, and a confirmed item is kept as a tag on the transaction (never a silent change).
 */
import { isTransfer } from '../ledger/categorize'
import type { Transaction } from '../ledger/types'

export type TaxCountry = 'DE' | 'IN'

/** Income categories that are usually taxable as income in the year received. */
export const TAXABLE_INCOME_CATEGORIES = [
  'Salary',
  'Bonus',
  'Freelance & side income',
  'Interest & dividends',
  'Rental income',
  'Pension',
]

/**
 * Spending that may be deductible, by country. Each entry suggests a tag. These are prompts for the user to
 * check, not claims that the spending is deductible.
 */
export const DEDUCTION_HINTS: Record<TaxCountry, Array<{ category: string; tag: string; label: string }>> = {
  DE: [
    { category: 'Education', tag: 'tax:de:werbungskosten', label: 'Professional training (Werbungskosten)' },
    { category: 'Transport', tag: 'tax:de:werbungskosten', label: 'Commuting or work travel (Werbungskosten)' },
    { category: 'Health', tag: 'tax:de:sonderausgaben', label: 'Health costs (Sonderausgaben / außergewöhnliche Belastungen)' },
    { category: 'Insurance', tag: 'tax:de:sonderausgaben', label: 'Insurance premiums (Sonderausgaben)' },
    { category: 'Gifts & donations', tag: 'tax:de:spenden', label: 'Donations (Spenden)' },
  ],
  IN: [
    { category: 'Insurance', tag: 'tax:in:80d', label: 'Health insurance premiums (80D, old regime)' },
    { category: 'Gifts & donations', tag: 'tax:in:80g', label: 'Donations (80G, old regime)' },
    { category: 'Savings & investments', tag: 'tax:in:80c', label: 'Investments such as PPF, ELSS (80C, old regime)' },
    { category: 'Education', tag: 'tax:in:80e', label: 'Education loan interest (80E, old regime)' },
  ],
}

export interface TaxYearSummary {
  country: TaxCountry
  year: number
  currency: string
  /** Money in from taxable income categories, in the year */
  taxableIncome: number
  /** Income by category, largest first */
  incomeByCategory: Array<{ category: string; amount: number }>
  /** Transactions in the year that are not classified as taxable income and need a check */
  unclassifiedIn: number
  /** Count of payments included, so the figure can be traced */
  incomeTransactionIds: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** First and last day (ISO) of a tax year. Germany: the calendar year. India: April to March, so 2025 is FY 2025-26. */
export function yearBounds(country: TaxCountry, year: number): { start: string; end: string } {
  if (country === 'IN') return { start: `${year}-04-01`, end: `${year + 1}-03-31` }
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

export function taxYearSummary(transactions: Transaction[], country: TaxCountry, year: number, currency: string): TaxYearSummary {
  const { start: from, end: to } = yearBounds(country, year)
  const inYear = transactions.filter((t) => t.date >= from && t.date <= to && t.currency === currency && !isTransfer(t))
  const incomeRows = inYear.filter((t) => t.direction === 'in' && TAXABLE_INCOME_CATEGORIES.includes(t.category))
  const byCat = new Map<string, number>()
  for (const t of incomeRows) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount)
  return {
    country,
    year,
    currency,
    taxableIncome: r2(incomeRows.reduce((s, t) => s + t.amount, 0)),
    incomeByCategory: [...byCat.entries()].map(([category, amount]) => ({ category, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
    unclassifiedIn: inYear.filter((t) => t.direction === 'in' && !TAXABLE_INCOME_CATEGORIES.includes(t.category) && t.category !== 'Refund' && t.category !== 'Tax refund').length,
    incomeTransactionIds: incomeRows.map((t) => t.id),
  }
}

export interface DeductionSuggestion {
  transactionId: string
  date: string
  amount: number
  description: string
  /** The tag that would be kept if the user confirms */
  tag: string
  label: string
  /** Already carries this tag: nothing to suggest */
  alreadyTagged: boolean
}

/** Spending in the year that may be deductible, one suggestion per payment. Nothing is saved here. */
export function deductionSuggestions(transactions: Transaction[], country: TaxCountry, year: number, currency: string): DeductionSuggestion[] {
  const hints = DEDUCTION_HINTS[country]
  const { start: from, end: to } = yearBounds(country, year)
  const out: DeductionSuggestion[] = []
  for (const t of transactions) {
    if (t.direction !== 'out' || t.currency !== currency || t.date < from || t.date > to || isTransfer(t)) continue
    for (const h of hints) {
      if (t.category !== h.category) continue
      out.push({
        transactionId: t.id,
        date: t.date,
        amount: t.amount,
        description: t.description,
        tag: h.tag,
        label: h.label,
        alreadyTagged: t.tags.includes(h.tag),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Tags a confirmed suggestion adds to a transaction. Other tags are kept as they are. */
export function tagsWithConfirmation(existing: string[], tag: string): string[] {
  return existing.includes(tag) ? existing : [...existing, tag]
}
