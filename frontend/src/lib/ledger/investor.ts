/**
 * What the user may tell FinBuddy about themselves to plan investments. Every field is optional and
 * the Invest page works without any of them. Kept in the Profile tab of the user's own Ledger.
 */

export const EMPLOYMENT = [
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'public_sector', label: 'Public sector, secure post' },
  { value: 'student', label: 'Student' },
  { value: 'retired', label: 'Retired' },
  { value: 'between_jobs', label: 'Between jobs' },
  { value: 'other', label: 'Other' },
] as const

export const INCOME_STABILITY = [
  { value: 'stable', label: 'Stable: about the same each month' },
  { value: 'variable', label: 'Varies: bonuses, commission or freelance work' },
  { value: 'uncertain', label: 'Uncertain: contract ending or the job is at risk' },
] as const

export type Employment = (typeof EMPLOYMENT)[number]['value']
export type IncomeStability = (typeof INCOME_STABILITY)[number]['value']

export interface InvestorProfile {
  /** Year of birth, used for the time left before money is needed */
  birthYear?: number
  employment?: Employment
  incomeStability?: IncomeStability
}

const oneOf = <T extends string>(options: ReadonlyArray<{ value: T }>, v: unknown): T | undefined =>
  options.find((o) => o.value === v)?.value

/**
 * Reads whatever was stored and keeps only valid answers; anything else is dropped, never guessed.
 * `now` is the current year, so a birth year in the future or before 1900 is not accepted.
 */
export function cleanInvestorProfile(raw: unknown, now = new Date().getFullYear()): InvestorProfile {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: InvestorProfile = {}
  const year = Number(r.birthYear)
  if (r.birthYear !== '' && r.birthYear != null && Number.isInteger(year) && year >= 1900 && year <= now - 16) out.birthYear = year
  const employment = oneOf(EMPLOYMENT, r.employment)
  if (employment) out.employment = employment
  const stability = oneOf(INCOME_STABILITY, r.incomeStability)
  if (stability) out.incomeStability = stability
  return out
}

/** Whole years of age in the given year, or undefined when no birth year is known. */
export function ageIn(profile: InvestorProfile | undefined, now = new Date().getFullYear()): number | undefined {
  return profile?.birthYear ? now - profile.birthYear : undefined
}

export const isEmptyInvestor = (p: InvestorProfile | undefined) => !p || (!p.birthYear && !p.employment && !p.incomeStability)
