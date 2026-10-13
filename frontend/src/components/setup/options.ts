/** Choices for the guided (non-AI) setup. Values must stay compatible with the backend validator. */

export interface Option {
  value: string
  label: string
}

/** ISO 3166-1 alpha-2, uppercase (validator requires 2–3 uppercase letters). */
export const COUNTRIES: Option[] = [
  { value: 'DE', label: 'Germany' },
  { value: 'IN', label: 'India' },
  { value: 'AT', label: 'Austria' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'FR', label: 'France' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'IE', label: 'Ireland' },
  { value: 'AE', label: 'United Arab Emirates' },
]

/** Must match validTypes in src/utils/schemaValidator.ts */
export const ACCOUNT_TYPES: Option[] = [
  { value: 'bank', label: 'Current account' },
  { value: 'savings', label: 'Savings' },
  { value: 'card', label: 'Credit card' },
  { value: 'investment', label: 'Investments / brokerage' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other (loan, pension…)' },
]

export const DEFAULT_CATEGORIES = [
  'Housing',
  'Groceries',
  'Utilities',
  'Transport',
  'Insurance',
  'Health',
  'Dining out',
  'Shopping',
  'Subscriptions',
  'Travel',
  'Education',
  'Childcare',
  'Entertainment',
  'Gifts & donations',
]

/** Preselected on first setup — a sensible minimum the user can change. */
export const STARTER_CATEGORIES = ['Housing', 'Groceries', 'Utilities', 'Transport', 'Insurance', 'Health']

export const GOALS = [
  'Emergency fund',
  'Buy a home',
  'Retirement',
  "Children's education",
  'Pay off debt',
  'Travel',
  'Buy a car',
]

export const INVESTMENT_TYPES = [
  'ETFs / index funds',
  'Mutual funds',
  'Shares',
  'Bonds',
  'Fixed deposits',
  'Pension / retirement plans',
  'Real estate',
  'Gold',
  'Crypto',
]

export const RELATIONSHIPS: Option[] = [
  { value: 'partner', label: 'Partner / spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Other dependant' },
]

export const FILING_STATUS: Option[] = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married — joint assessment' },
  { value: 'married_separate', label: 'Married — separate assessment' },
  { value: 'unsure', label: 'Not sure' },
]

export const countryLabel = (code: string) => COUNTRIES.find((c) => c.value === code)?.label ?? code
