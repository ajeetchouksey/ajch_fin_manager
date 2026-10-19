/** Shared shapes for tax estimates. Every estimate says what it is based on and what it leaves out. */

export interface TaxSource {
  title: string
  url: string
  /** When the figures were last checked against this source (YYYY-MM-DD) */
  checked: string
}

export interface TaxLine {
  label: string
  amount: number
}

export interface TaxEstimate {
  /** Always true: these are estimates, not a tax assessment */
  estimate: true
  country: 'DE' | 'IN'
  /** Calendar year (Germany) or financial year like "2025-26" (India) */
  year: string
  currency: 'EUR' | 'INR'
  lines: TaxLine[]
  total: number
  /** total / income, when income is above zero */
  averageRate: number
  /** Tax on the next 100 of income, as a share */
  marginalRate: number
  assumptions: string[]
  notCovered: string[]
  sources: TaxSource[]
}

/** Raised when a year's rules are not encoded, so callers never get a guessed figure. */
export class TaxYearNotCovered extends Error {
  constructor(country: string, year: string, covered: string[]) {
    super(`Tax rules for ${country} ${year} are not covered yet. Covered: ${covered.join(', ')}.`)
    this.name = 'TaxYearNotCovered'
  }
}

export const NOT_ADVICE = 'Estimate and organisation aid only, not tax advice. Check with a tax adviser before relying on it.'
