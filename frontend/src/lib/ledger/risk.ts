import { accountBalances } from './balances'
import { TRANSFER_CATEGORY } from './categorize'
import { ageIn, type InvestorProfile, type RiskAnswers } from './investor'
import type { Account, BalanceEntry, Goal } from './portfolio'
import type { Transaction } from './types'

/**
 * Risk as three separate answers, so a mismatch between them is visible:
 *   ability     could the user afford a large fall (from their situation, calculated)
 *   willingness would the user stay calm in a fall (from a short questionnaire)
 *   need        what return do the goals require (calculated from target, date, value and plan)
 * General information only. Nothing here names a product or says what to buy.
 */

export type Level = 'low' | 'medium' | 'high'
const SCORE: Record<Level, number> = { low: 1, medium: 2, high: 3 }
export const LEVEL_LABEL: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const fromAverage = (avg: number): Level => (avg < 1.67 ? 'low' : avg < 2.34 ? 'medium' : 'high')
const lower = (a: Level, b: Level): Level => (SCORE[a] <= SCORE[b] ? a : b)

// ---------- willingness ----------

export interface RiskQuestion {
  id: string
  text: string
  /** Four answers, from the most cautious (scores 1) to the most comfortable with risk (scores 4) */
  options: [string, string, string, string]
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: 'fall', text: 'Your investments lose a fifth of their value within a few months. What do you do?', options: ['Sell everything', 'Sell some', 'Do nothing and wait', 'Buy more while prices are low'] },
  { id: 'range', text: 'For every 100 you invest over a year, which range of results could you accept?', options: ['From −3 to +5', 'From −10 to +12', 'From −20 to +25', 'From −30 to +40'] },
  { id: 'never-below', text: 'How important is it that your money never falls below what you put in?', options: ['Essential', 'Important', 'Somewhat important', 'Not important'] },
  { id: 'feeling', text: 'How do you feel when you check your investments during a downturn?', options: ['Very anxious', 'Uneasy', 'Mostly calm', 'I see it as a chance'] },
  { id: 'wait', text: 'If markets kept falling, how long could you leave the money alone?', options: ['Less than a year', 'One to three years', 'Three to seven years', 'More than seven years'] },
  { id: 'experience', text: 'How much investing experience do you have?', options: ['None yet', 'A little', 'Several years', 'I invest actively'] },
]

/** The willingness level from the answers given. At least four of the six are needed; fewer says "not enough". */
export function willingness(answers: RiskAnswers | undefined): { level: Level | null; answered: number; total: number } {
  const given = RISK_QUESTIONS.map((q) => answers?.[q.id]).filter((v): v is 1 | 2 | 3 | 4 => v !== undefined)
  const total = RISK_QUESTIONS.length
  if (given.length < 4) return { level: null, answered: given.length, total }
  const avg = given.reduce((s, v) => s + v, 0) / given.length
  return { level: avg < 1.75 ? 'low' : avg < 2.75 ? 'medium' : 'high', answered: given.length, total }
}

// ---------- ability ----------

export interface Factor {
  id: 'age' | 'income' | 'buffer' | 'debt' | 'dependants' | 'goal-time'
  label: string
  level: Level
  reason: string
}

export interface AbilityInput {
  investor?: InvestorProfile
  /** Current calendar year */
  year: number
  /** Months until the nearest goal that is funded by investments */
  nearestGoalMonths?: number
  /** Cash held, in months of normal spending */
  bufferMonths?: number
  /** Debts as a share of assets (0.3 = debts are 30% of assets) */
  debtShare?: number
  /** Children or other dependants in the household */
  dependants?: number
}

/** A typical retirement age used only to turn a birth year into years of work left; shown in the reason. */
export const REFERENCE_RETIREMENT_AGE = 67

export function abilityFactors(i: AbilityInput): Factor[] {
  const out: Factor[] = []
  const age = ageIn(i.investor, i.year)
  if (i.investor?.employment === 'retired') {
    out.push({ id: 'age', label: 'Life stage', level: 'low', reason: 'Retired: the money is likely to pay for living costs.' })
  } else if (age !== undefined) {
    const left = REFERENCE_RETIREMENT_AGE - age
    out.push({
      id: 'age',
      label: 'Age',
      level: left >= 25 ? 'high' : left >= 10 ? 'medium' : 'low',
      reason: left > 0 ? `About ${left} years to a typical retirement age of ${REFERENCE_RETIREMENT_AGE}.` : `Past a typical retirement age of ${REFERENCE_RETIREMENT_AGE}.`,
    })
  }
  const stability = i.investor?.incomeStability
  if (stability) {
    out.push({
      id: 'income',
      label: 'Income',
      level: stability === 'stable' ? 'high' : stability === 'variable' ? 'medium' : 'low',
      reason: stability === 'stable' ? 'Income is stable.' : stability === 'variable' ? 'Income varies from month to month.' : 'Income is uncertain.',
    })
  }
  if (i.bufferMonths !== undefined) {
    const m = Math.round(i.bufferMonths * 10) / 10
    out.push({ id: 'buffer', label: 'Safety buffer', level: m < 3 ? 'low' : m < 6 ? 'medium' : 'high', reason: `Cash covers about ${m} months of spending.` })
  }
  if (i.debtShare !== undefined) {
    const pct = Math.round(i.debtShare * 100)
    out.push({ id: 'debt', label: 'Debts', level: i.debtShare < 0.2 ? 'high' : i.debtShare < 0.5 ? 'medium' : 'low', reason: pct === 0 ? 'No debts recorded.' : `Debts are about ${pct}% of what you own.` })
  }
  if (i.dependants !== undefined) {
    out.push({
      id: 'dependants',
      label: 'Dependants',
      level: i.dependants === 0 ? 'high' : i.dependants <= 2 ? 'medium' : 'low',
      reason: i.dependants === 0 ? 'No children or dependants recorded.' : `${i.dependants} ${i.dependants === 1 ? 'child or dependant' : 'children or dependants'} in the household.`,
    })
  }
  if (i.nearestGoalMonths !== undefined) {
    const y = Math.round((i.nearestGoalMonths / 12) * 10) / 10
    out.push({ id: 'goal-time', label: 'Time to your nearest investing goal', level: i.nearestGoalMonths < 36 ? 'low' : i.nearestGoalMonths < 84 ? 'medium' : 'high', reason: `About ${y} years away.` })
  }
  return out
}

/** The ability level from its factors: their average, and never above Medium when the safety buffer is thin. At least two factors are needed. */
export function ability(factors: Factor[]): { level: Level | null; factors: Factor[] } {
  if (factors.length < 2) return { level: null, factors }
  let level = fromAverage(factors.reduce((s, f) => s + SCORE[f.level], 0) / factors.length)
  if (factors.some((f) => f.id === 'buffer' && f.level === 'low')) level = lower(level, 'medium')
  return { level, factors }
}

// ---------- need ----------

/**
 * The yearly return a goal needs: the lowest rate at which the current value plus the monthly amount,
 * compounding monthly, reaches the target on the date. 0 when saving alone gets there; null when even
 * 100% a year would not.
 */
export function requiredReturn(current: number, monthly: number, months: number, target: number): number | null {
  if (current + monthly * months >= target) return 0
  const value = (annual: number) => {
    const i = Math.pow(1 + annual, 1 / 12) - 1
    return current * Math.pow(1 + i, months) + monthly * ((Math.pow(1 + i, months) - 1) / i)
  }
  if (value(1) < target) return null
  let lo = 0
  let hi = 1
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2
    if (value(mid) < target) lo = mid
    else hi = mid
  }
  return Math.round(hi * 10000) / 10000
}

export interface GoalNeed {
  id: string
  name: string
  /** Yearly return needed, as a fraction (0.05 = 5%); null when not reachable at any return */
  rate: number | null
  level: Level
  /** More than 15% a year is not a plan; the goal needs more saving, a later date or a lower target */
  stretch: boolean
}

export const levelOfRate = (rate: number | null): Level => (rate === null || rate > 0.06 ? 'high' : rate > 0.03 ? 'medium' : 'low')

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** What each goal with a date, a target and money still to find needs. `currentOf` is the money already set aside for the goal. */
export function goalNeeds(goals: Goal[], currentOf: (g: Goal) => number, today: string): GoalNeed[] {
  const out: GoalNeed[] = []
  for (const g of goals) {
    if (!g.targetDate || g.target <= 0) continue
    const months = monthsBetween(today.slice(0, 7), g.targetDate.slice(0, 7))
    if (months < 1) continue
    const current = currentOf(g)
    if (current >= g.target) continue
    const rate = requiredReturn(current, g.monthly, months, g.target)
    out.push({ id: g.id, name: g.name, rate, level: levelOfRate(rate), stretch: rate === null || rate > 0.15 })
  }
  return out
}

/** The need of all goals together: that of the most demanding goal. */
export function overallNeed(needs: GoalNeed[]): Level | null {
  if (!needs.length) return null
  return needs.reduce<Level>((m, n) => (SCORE[n.level] > SCORE[m] ? n.level : m), 'low')
}

// ---------- from the Ledger ----------

export interface LedgerRiskData {
  transactions: Transaction[]
  accounts: Account[]
  balances: BalanceEntry[]
  goals: Goal[]
  householdMembers?: Array<{ name: string; relationship: string }>
  investor?: InvestorProfile
  today: string
}

/** The calculated inputs for ability and need, from what the Ledger holds. Missing information stays missing. */
export function ledgerRiskInputs(d: LedgerRiskData): { ability: AbilityInput; needs: GoalNeed[] } {
  const year = Number(d.today.slice(0, 4))
  const input: AbilityInput = { investor: d.investor, year }

  const currencies = [...new Set(d.accounts.map((a) => a.currency))]
  const rowsOf = (cur: string) => accountBalances(d.accounts, cur, d.balances, d.transactions, d.today)
  const home = currencies.map((c) => ({ c, b: rowsOf(c) })).sort((a, b) => b.b.assets - a.b.assets)[0]
  if (home) {
    input.debtShare = home.b.assets > 0 ? home.b.debts / home.b.assets : home.b.debts > 0 ? 1 : 0
    const cash = home.b.rows.filter((r) => r.group === 'cash').reduce((s, r) => s + r.balance, 0)
    const since = new Date(Date.parse(d.today + 'T00:00:00Z') - 90 * 86_400_000).toISOString().slice(0, 10)
    const spent = d.transactions
      .filter((t) => t.direction === 'out' && t.currency === home.c && t.category !== TRANSFER_CATEGORY && t.date.slice(0, 10) > since && t.date.slice(0, 10) <= d.today)
      .reduce((s, t) => s + t.amount, 0)
    if (spent > 0) input.bufferMonths = cash / (spent / 3)
  }

  if (d.householdMembers) input.dependants = d.householdMembers.filter((m) => /child|son|daughter|kid|dependent/i.test(m.relationship)).length

  const balanceOf = new Map<string, number>()
  const groupOf = new Map<string, string>()
  for (const c of currencies) for (const r of rowsOf(c).rows) {
    balanceOf.set(r.id, r.balance)
    groupOf.set(r.id, r.group)
  }
  const currentOf = (g: Goal) => (g.accountId && balanceOf.has(g.accountId) ? balanceOf.get(g.accountId)! : g.saved)
  // Only goals paid for from an investment or retirement account say anything about investment risk;
  // a cash goal such as an emergency fund is met by saving, not by return.
  const investing = d.goals.filter((g) => g.accountId && ['investments', 'retirement'].includes(groupOf.get(g.accountId) ?? ''))
  const needs = goalNeeds(investing, currentOf, d.today)

  const funded = investing.filter((g) => g.targetDate && monthsBetween(d.today.slice(0, 7), g.targetDate.slice(0, 7)) >= 1)
  if (funded.length) input.nearestGoalMonths = Math.min(...funded.map((g) => monthsBetween(d.today.slice(0, 7), g.targetDate.slice(0, 7))))
  return { ability: input, needs }
}

// ---------- the three together ----------

/** One plain sentence on how the three answers fit together; empty until at least two are known. */
export function togetherNote(a: Level | null, w: Level | null, n: Level | null, stretch = false): string {
  const known = [a, w, n].filter((x): x is Level => x !== null)
  if (known.length < 2) return ''
  if (stretch) return 'At least one goal needs a return that no plan can count on. Saving more, moving the date or lowering the target will help more than taking more risk.'
  const comfortable = a && w ? lower(a, w) : (a ?? w)!
  if (n && SCORE[n] > SCORE[comfortable]) return 'Your goals need more return than your situation or your comfort with risk points to. Saving more, moving a date or lowering a target are the options to weigh against accepting more risk.'
  if (a && w && SCORE[w] > SCORE[a]) return 'You are comfortable with more risk than your situation can carry right now. Your ability to take a fall sets the sensible limit.'
  if (a && w && SCORE[a] > SCORE[w]) return 'Your situation could carry more risk than you are comfortable with. That is a fine choice; it can mean saving more to reach the same goals.'
  return 'Your answers point the same way.'
}
