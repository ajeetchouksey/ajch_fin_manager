/**
 * Goal scenarios: where each investing goal lands under a few illustrative yearly returns, the return it
 * actually needs, and where the plan and the person's own answers disagree.
 * The returns are cases to compare, not forecasts. Fees, tax and inflation are not included, and nothing
 * here names a product or says what to buy.
 */

import { investingGoals, levelOfRate, monthsBetween, requiredReturn, type Level, type LedgerRiskData } from './risk'
import { monthlyEquivalent, planState, type Plan } from './plans'

export const SCENARIO_CASES = [
  { id: 'flat', label: 'No growth', rate: 0 },
  { id: 'modest', label: 'Modest growth', rate: 0.03 },
  { id: 'strong', label: 'Stronger growth', rate: 0.06 },
] as const

/** Value after `months` of saving `monthly` on top of `current`, compounding monthly at `annualRate`. */
export function futureValue(current: number, monthly: number, months: number, annualRate: number): number {
  if (months <= 0) return current
  if (annualRate === 0) return current + monthly * months
  const i = Math.pow(1 + annualRate, 1 / 12) - 1
  return current * Math.pow(1 + i, months) + monthly * ((Math.pow(1 + i, months) - 1) / i)
}

/** The monthly amount, rounded up to a whole unit, that reaches `target` in `months` at `annualRate`; 0 when the current value alone gets there. */
export function requiredMonthly(current: number, months: number, target: number, annualRate: number): number {
  if (months <= 0) return Math.max(0, Math.ceil(target - current))
  const grown = futureValue(current, 0, months, annualRate)
  if (grown >= target) return 0
  return Math.ceil((target - grown) / futureValue(0, 1, months, annualRate))
}

export interface CaseResult {
  id: string
  label: string
  rate: number
  /** Value on the goal date */
  value: number
  reaches: boolean
  /** How far short, 0 when it reaches */
  short: number
  /** Monthly amount that would reach the target at this return */
  monthlyNeeded: number
}

export interface GoalScenario {
  id: string
  name: string
  currency: string
  target: number
  targetDate: string
  current: number
  /** Monthly amount used: the plans linked to the goal when there are any, otherwise the goal's own monthly saving */
  monthly: number
  source: 'plans' | 'goal'
  months: number
  cases: CaseResult[]
  /** Yearly return needed as a fraction; null when not reachable at any return */
  neededRate: number | null
  level: Level
  /** The goal's own monthly saving, when it differs from what the linked plans add up to */
  goalMonthly: number
}

/** The regular monthly amount for a goal: its linked plans that are running or still to start, else its own monthly saving. */
export function contributionFor(goalId: string, goalMonthly: number, currency: string, plans: Plan[], today: string): { monthly: number; source: 'plans' | 'goal' } {
  const linked = plans.filter((p) => p.goalId === goalId && p.currency === currency && p.frequency !== 'once' && planState(p, today) !== 'ended')
  if (linked.length === 0) return { monthly: goalMonthly, source: 'goal' }
  return { monthly: Math.round(linked.reduce((s, p) => s + monthlyEquivalent(p), 0) * 100) / 100, source: 'plans' }
}

/** One scenario for each goal paid for from an investment or retirement account that has a date, a target and money still to find. */
export function goalScenarios(d: LedgerRiskData, plans: Plan[]): GoalScenario[] {
  const out: GoalScenario[] = []
  for (const { goal, current } of investingGoals(d)) {
    if (!goal.targetDate || goal.target <= 0 || current >= goal.target) continue
    const months = monthsBetween(d.today.slice(0, 7), goal.targetDate.slice(0, 7))
    if (months < 1) continue
    const { monthly, source } = contributionFor(goal.id, goal.monthly, goal.currency, plans, d.today)
    const neededRate = requiredReturn(current, monthly, months, goal.target)
    out.push({
      id: goal.id,
      name: goal.name,
      currency: goal.currency,
      target: goal.target,
      targetDate: goal.targetDate,
      current,
      monthly,
      source,
      months,
      cases: SCENARIO_CASES.map((c) => {
        const value = Math.round(futureValue(current, monthly, months, c.rate))
        return { id: c.id, label: c.label, rate: c.rate, value, reaches: value >= goal.target, short: Math.max(0, Math.round(goal.target - value)), monthlyNeeded: requiredMonthly(current, months, goal.target, c.rate) }
      }),
      neededRate,
      level: levelOfRate(neededRate),
      goalMonthly: goal.monthly,
    })
  }
  return out
}

export interface ScenarioWarning {
  id: string
  goalId: string
  text: string
}

const RANK: Record<Level, number> = { low: 1, medium: 2, high: 3 }
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`

/** Where a goal's plan and the person's own answers disagree, in plain words. Empty when nothing stands out. */
export function scenarioWarnings(scenarios: GoalScenario[], ability: Level | null, willingness: Level | null, money: (v: number, currency: string) => string): ScenarioWarning[] {
  const known = [ability, willingness].filter((l): l is Level => l !== null)
  const comfortable = known.length ? known.reduce((m, l) => (RANK[l] < RANK[m] ? l : m)) : null
  const out: ScenarioWarning[] = []
  for (const s of scenarios) {
    const stretch = s.neededRate === null || s.neededRate > 0.15
    if (s.neededRate === null) {
      out.push({ id: `${s.id}-stretch`, goalId: s.id, text: `"${s.name}" is out of reach with the current plan, even at a very high return. It needs more saving, a later date or a lower target.` })
    } else if (stretch) {
      out.push({ id: `${s.id}-stretch`, goalId: s.id, text: `"${s.name}" needs about ${pct(s.neededRate)} a year, which no plan can count on. More saving, a later date or a lower target will help more than more risk.` })
    } else if (comfortable && s.neededRate > 0 && RANK[s.level] > RANK[comfortable]) {
      out.push({ id: `${s.id}-comfort`, goalId: s.id, text: `"${s.name}" needs about ${pct(s.neededRate)} a year, which is more than your situation or your comfort with risk points to. Weigh saving more or moving the date against accepting more risk.` })
    }
    if (s.months < 36 && s.neededRate !== 0) {
      out.push({ id: `${s.id}-soon`, goalId: s.id, text: `"${s.name}" is under three years away and relies on growth. A fall close to the date may not recover in time, so money needed soon is usually kept steadier.` })
    }
    if (s.source === 'plans' && s.goalMonthly > 0 && Math.abs(s.goalMonthly - s.monthly) > Math.max(1, s.goalMonthly * 0.1)) {
      out.push({ id: `${s.id}-differs`, goalId: s.id, text: `Your plans for "${s.name}" add up to ${money(s.monthly, s.currency)} a month, but the goal itself says ${money(s.goalMonthly, s.currency)}. These scenarios use the plans.` })
    }
  }
  return out
}
