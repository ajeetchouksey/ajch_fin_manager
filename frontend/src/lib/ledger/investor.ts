/**
 * What the user may tell FinBuddy about themselves to plan investments. Every field is optional and
 * the Invest page works without any of them. Kept in the Profile tab of the user's own Ledger.
 */

import { cleanTarget, type AllocationTarget } from './allocation'

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

/** Answers to the willingness questions: question id to 1 (most cautious) to 4 (most comfortable with risk) */
export type RiskAnswers = Record<string, 1 | 2 | 3 | 4>

export interface InvestorProfile {
  /** Year of birth, used for the time left before money is needed */
  birthYear?: number
  employment?: Employment
  incomeStability?: IncomeStability
  riskAnswers?: RiskAnswers
  /** Target share of each kind of holding, in whole percent (see allocation.ts) */
  allocationTarget?: AllocationTarget
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
  if (r.riskAnswers && typeof r.riskAnswers === 'object') {
    const answers: RiskAnswers = {}
    for (const [id, v] of Object.entries(r.riskAnswers as Record<string, unknown>).slice(0, 12)) {
      if (/^[a-z-]{1,20}$/.test(id) && (v === 1 || v === 2 || v === 3 || v === 4)) answers[id] = v
    }
    if (Object.keys(answers).length) out.riskAnswers = answers
  }
  const target = cleanTarget(r.allocationTarget)
  if (target) out.allocationTarget = target
  return out
}

/** Whole years of age in the given year, or undefined when no birth year is known. */
export function ageIn(profile: InvestorProfile | undefined, now = new Date().getFullYear()): number | undefined {
  return profile?.birthYear ? now - profile.birthYear : undefined
}

/** True when none of the about-you answers is given (the risk answers and the allocation target are kept separately). */
export const isEmptyInvestor = (p: InvestorProfile | undefined) => !p || (!p.birthYear && !p.employment && !p.incomeStability)

/** The about-you part of a profile, without the risk answers and the allocation target. */
export const aboutYou = (p: InvestorProfile): InvestorProfile => ({ birthYear: p.birthYear, employment: p.employment, incomeStability: p.incomeStability })
