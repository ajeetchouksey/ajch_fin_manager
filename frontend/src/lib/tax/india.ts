/**
 * Indian income tax for individuals under 60, old and new regime, with the section 87A rebate, surcharge and
 * Health and Education Cess. Rules are data per financial year, checked against the Income Tax Department.
 */
import { NOT_ADVICE, TaxYearNotCovered, type TaxEstimate, type TaxSource } from './types'

type Slab = [upTo: number, rate: number]

interface IndiaRules {
  newSlabs: Slab[]
  oldSlabs: Slab[]
  rebate: Record<Regime, { limit: number; max: number }>
  cess: number
  /** [income above, rate]; the new regime caps at 25% */
  surcharge: Array<[number, number]>
  newRegimeSurchargeCap: number
  /** Standard deduction for salaried people. Confirm before relying on it (see assumptions). */
  standardDeduction: Record<Regime, number>
  sources: TaxSource[]
}

export type Regime = 'new' | 'old'

export const IN_RULES: Record<string, IndiaRules> = {
  '2025-26': {
    newSlabs: [
      [400000, 0],
      [800000, 0.05],
      [1200000, 0.1],
      [1600000, 0.15],
      [2000000, 0.2],
      [2400000, 0.25],
      [Infinity, 0.3],
    ],
    oldSlabs: [
      [250000, 0],
      [500000, 0.05],
      [1000000, 0.2],
      [Infinity, 0.3],
    ],
    rebate: { new: { limit: 1200000, max: 60000 }, old: { limit: 500000, max: 12500 } },
    cess: 0.04,
    surcharge: [
      [5000000, 0.1],
      [10000000, 0.15],
      [20000000, 0.25],
      [50000000, 0.37],
    ],
    newRegimeSurchargeCap: 0.25,
    standardDeduction: { new: 75000, old: 50000 },
    sources: [
      { title: 'Income Tax Department: salaried individuals, AY 2026-27', url: 'https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1', checked: '2026-10-16' },
    ],
  },
}

export const IN_YEARS = Object.keys(IN_RULES)

function rulesFor(year: string): IndiaRules {
  const r = IN_RULES[year]
  if (!r) throw new TaxYearNotCovered('India', year, IN_YEARS)
  return r
}

export function slabTax(income: number, slabs: Slab[]): number {
  let tax = 0
  let lower = 0
  for (const [upTo, rate] of slabs) {
    if (income > lower) tax += (Math.min(income, upTo) - lower) * rate
    lower = upTo
  }
  return tax
}

function surchargeRate(income: number, regime: Regime, rules: IndiaRules): number {
  let rate = 0
  for (const [above, r] of rules.surcharge) if (income > above) rate = r
  return regime === 'new' ? Math.min(rate, rules.newRegimeSurchargeCap) : rate
}

export interface InEstimateInput {
  year: string
  regime: Regime
  /** Gross salary for the year */
  salary?: number
  /** Other income taxed at slab rates (interest, rent after its own deductions) */
  otherIncome?: number
  /** Deductions you claim under the old regime (80C, 80D and others), already within their limits */
  oldRegimeDeductions?: number
  /** Resident individuals get the 87A rebate; non-residents do not */
  resident?: boolean
  /** Override the standard deduction if your adviser or Form 16 says otherwise */
  standardDeduction?: number
}

export function estimateIN(input: InEstimateInput): TaxEstimate {
  const rules = rulesFor(input.year)
  const regime = input.regime
  const resident = input.resident ?? true
  const salary = Math.max(input.salary ?? 0, 0)
  const std = salary > 0 ? (input.standardDeduction ?? rules.standardDeduction[regime]) : 0
  const deductions = regime === 'old' ? Math.max(input.oldRegimeDeductions ?? 0, 0) : 0
  const taxable = Math.max(Math.max(salary - std, 0) + Math.max(input.otherIncome ?? 0, 0) - deductions, 0)

  const compute = (income: number) => {
    const base = slabTax(income, regime === 'new' ? rules.newSlabs : rules.oldSlabs)
    const { limit, max } = rules.rebate[regime]
    const rebate = resident && income <= limit ? Math.min(base, max) : 0
    const afterRebate = base - rebate
    const surcharge = afterRebate * surchargeRate(income, regime, rules)
    const cess = (afterRebate + surcharge) * rules.cess
    return { base, rebate, surcharge, cess, total: afterRebate + surcharge + cess }
  }

  const r = compute(taxable)
  const next = compute(taxable + 100)
  const round = (n: number) => Math.round(n)
  return {
    estimate: true,
    country: 'IN',
    year: input.year,
    currency: 'INR',
    lines: [
      { label: `Tax on slabs (${regime} regime)`, amount: round(r.base) },
      { label: 'Rebate under section 87A', amount: -round(r.rebate) },
      { label: 'Surcharge', amount: round(r.surcharge) },
      { label: 'Health and Education Cess (4%)', amount: round(r.cess) },
    ],
    total: round(r.total),
    averageRate: taxable > 0 ? Math.round((r.total / taxable) * 10000) / 10000 : 0,
    marginalRate: Math.round(((next.total - r.total) / 100) * 10000) / 10000,
    assumptions: [
      `Taxable income of ${round(taxable)} INR under the ${regime} regime, for an individual under 60.`,
      salary > 0
        ? `Standard deduction of ${std} INR for salary. ${input.standardDeduction === undefined ? 'This is the commonly quoted figure; sources disagree for FY 2025-26, so confirm it with your Form 16.' : 'As you supplied it.'}`
        : 'No salary, so no standard deduction.',
      regime === 'old' ? `Old-regime deductions of ${round(deductions)} INR, as supplied and already within their limits.` : 'No deductions under the new regime apart from the standard deduction.',
      resident ? 'Resident individual, so the 87A rebate applies where eligible.' : 'Non-resident: no 87A rebate, and only income taxable in India belongs here.',
      NOT_ADVICE,
    ],
    notCovered: [
      'Marginal relief on the 87A rebate and on surcharge just above a threshold',
      'Capital gains at special rates (sections 111A, 112, 112A)',
      'Senior and super-senior citizen slabs (old regime)',
      'Limits on individual old-regime deductions (80C, 80D, 24(b))',
      'Double taxation relief and residency rules',
      'Tax already paid (TDS, advance tax); compare with Form 16 and Form 26AS or AIS',
    ],
    sources: rules.sources,
  }
}

/** Both regimes side by side, so the user can see which costs less for their inputs. */
export function compareRegimes(input: Omit<InEstimateInput, 'regime'>) {
  const newer = estimateIN({ ...input, regime: 'new' })
  const older = estimateIN({ ...input, regime: 'old' })
  return { new: newer, old: older, lower: newer.total <= older.total ? ('new' as const) : ('old' as const), difference: Math.abs(newer.total - older.total) }
}
