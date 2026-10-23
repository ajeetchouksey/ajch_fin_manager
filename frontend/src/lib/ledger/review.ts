import type { Transaction } from './types'
import { formatMoney } from './types'
import { accountType, type Account, type BalanceEntry, type Goal } from './portfolio'
import { allocationFor, driftNotes, putInVersusWorth, type Allocation, type PutInRow } from './allocation'
import { holdingCost, holdingGain, holdingValue, type Holding } from './holdings'
import { ageIn, EMPLOYMENT, INCOME_STABILITY, type InvestorProfile } from './investor'
import { monthlyEquivalent, planState, type Plan } from './plans'
import { ability, abilityFactors, investingGoals, ledgerRiskInputs, LEVEL_LABEL, overallNeed, togetherNote, willingness, type Factor, type Level, type LedgerRiskData } from './risk'
import { goalScenarios, scenarioWarnings, type GoalScenario } from './scenarios'
import { positionFrom, returnFrom, type Trade } from './trades'

export interface ReviewInput {
  accounts: Account[]
  balances: BalanceEntry[]
  transactions: Transaction[]
  goals: Goal[]
  plans: Plan[]
  holdings: Holding[]
  trades: Trade[]
  investor?: InvestorProfile
  householdMembers?: Array<{ name: string; relationship: string }>
  today: string
}

export interface ReviewHolding {
  name: string
  account: string
  kind: string
  isin: string
  quantity: number
  currency: string
  averageCost: number | null
  price: number | null
  priceDate: string
  value: number | null
  cost: number | null
  gain: number | null
  gainShare: number | null
  /** Only from trades: yearly return, once the first buy is old enough */
  yearly: number | null
  realised: number | null
  dividends: number | null
}

export interface ReviewPlan {
  name: string
  currency: string
  monthly: number
  state: string
  goal: string | null
  account: string | null
}

export interface InvestmentReview {
  generatedOn: string
  about: { age: number | null; work: string | null; income: string | null }
  risk: {
    ability: Level | null
    abilityFactors: Factor[]
    willingness: Level | null
    answered: number
    total: number
    need: Level | null
    together: string
  }
  goals: GoalScenario[]
  warnings: string[]
  plans: ReviewPlan[]
  accounts: PutInRow[]
  allocation: Allocation[]
  drift: string[]
  holdings: ReviewHolding[]
  /** What is missing, so the reader knows how far to trust the rest */
  gaps: string[]
  /** Questions worth taking to an adviser, drawn from the numbers above */
  questions: string[]
  notice: string
}

export const REVIEW_NOTICE =
  'General information drawn from the person\'s own Ledger, not regulated advice and not a recommendation of any product. Returns shown are illustrations, not forecasts. Fees, tax and inflation are not included unless stated.'

const labelOf = (list: ReadonlyArray<{ value: string; label: string }>, value: string | undefined) => list.find((o) => o.value === value)?.label ?? null

/** Everything an adviser (or the person's own AI) needs in one place. Pure: the same Ledger gives the same pack. */
export function buildReview(i: ReviewInput, money: (v: number, currency: string) => string = formatMoney): InvestmentReview {
  const investor = i.investor ?? {}
  const data: LedgerRiskData = {
    transactions: i.transactions,
    accounts: i.accounts,
    balances: i.balances,
    goals: i.goals,
    householdMembers: i.householdMembers,
    investor,
    today: i.today,
  }

  const inputs = ledgerRiskInputs(data)
  const ab = ability(abilityFactors(inputs.ability))
  const will = willingness(investor.riskAnswers)
  const need = overallNeed(inputs.needs)
  const scenarios = goalScenarios(data, i.plans)
  const stretch = scenarios.some((s) => s.neededRate === null || s.neededRate > 0.15)
  const warnings = scenarioWarnings(scenarios, ab.level, will.level, money).map((w) => w.text)

  const accountName = new Map(i.accounts.map((a) => [a.id, a.name]))
  const goalName = new Map(i.goals.map((g) => [g.id, g.name]))

  const plans: ReviewPlan[] = i.plans
    .filter((p) => planState(p, i.today) !== 'ended')
    .map((p) => ({
      name: p.name,
      currency: p.currency,
      monthly: Math.round(monthlyEquivalent(p) * 100) / 100,
      state: planState(p, i.today),
      goal: p.goalId ? (goalName.get(p.goalId) ?? null) : null,
      account: p.accountId ? (accountName.get(p.accountId) ?? null) : null,
    }))

  const accounts = putInVersusWorth(i.accounts, i.balances, i.transactions, i.today)
  const currencies = [...new Set(i.accounts.filter((a) => ['investments', 'retirement'].includes(accountType(a.type).group)).map((a) => a.currency.toUpperCase()))]
  const allocation = currencies.map((c) => allocationFor(i.accounts, i.balances, i.transactions, c, i.today, investor.allocationTarget, i.holdings)).filter((a) => a.total > 0)
  const drift = allocation.flatMap((a) => driftNotes(a))

  const holdings: ReviewHolding[] = i.holdings.map((h) => {
    const own = i.trades.filter((t) => t.holdingId === h.id)
    const value = holdingValue(h)
    const gain = own.length ? null : holdingGain(h)
    const ret = own.length ? returnFrom(own, value, i.today) : null
    const pos = own.length ? positionFrom(own) : null
    return {
      name: h.name,
      account: accountName.get(h.accountId) ?? '',
      kind: h.assetClass,
      isin: h.isin,
      quantity: h.quantity,
      currency: h.currency,
      averageCost: h.avgCost,
      price: h.price,
      priceDate: h.priceDate,
      value,
      cost: holdingCost(h),
      gain: ret ? ret.gain : (gain?.amount ?? null),
      gainShare: ret ? ret.gainShare : (gain?.share ?? null),
      yearly: ret ? ret.yearly : null,
      realised: pos ? pos.realised : null,
      dividends: pos ? pos.dividends : null,
    }
  })

  const gaps: string[] = []
  if (!investor.birthYear) gaps.push('Year of birth is not given, so time to retirement is not considered.')
  if (!investor.employment || !investor.incomeStability) gaps.push('Work or income stability is not given.')
  if (will.answered < will.total) gaps.push(will.answered === 0 ? 'The risk questions are not answered, so comfort with losses is unknown.' : `Only ${will.answered} of ${will.total} risk questions are answered.`)
  if (investingGoals(data).length === 0) gaps.push('No goal is linked to an investment or retirement account, so there are no scenarios.')
  if (!investor.allocationTarget) gaps.push('No target mix is set, so drift cannot be shown.')
  if (i.holdings.length === 0 && accounts.length > 0) gaps.push('No individual holdings are recorded; only account totals are known.')
  const unpriced = i.holdings.filter((h) => h.price === null).length
  if (unpriced > 0) gaps.push(`${unpriced} holding${unpriced === 1 ? ' has' : 's have'} no price, so ${unpriced === 1 ? 'its' : 'their'} value is not counted.`)
  const stale = i.holdings.filter((h) => h.price !== null && h.priceDate && h.priceDate < new Date(Date.parse(i.today + 'T00:00:00Z') - 90 * 86_400_000).toISOString().slice(0, 10)).length
  if (stale > 0) gaps.push(`${stale} price${stale === 1 ? ' is' : 's are'} older than 90 days.`)

  const questions: string[] = []
  for (const s of scenarios) {
    if (s.neededRate === null) questions.push(`"${s.name}" cannot be reached at any return with the current saving. Move the date, lower the target or save more?`)
    else if (s.neededRate > 0.06) questions.push(`"${s.name}" needs about ${Math.round(s.neededRate * 1000) / 10}% a year. Is that realistic, or should the plan change?`)
  }
  if (ab.level && will.level && ab.level !== will.level) questions.push(`Ability to take risk is ${LEVEL_LABEL[ab.level].toLowerCase()} but comfort with losses is ${LEVEL_LABEL[will.level].toLowerCase()}. Which should the plan follow?`)
  for (const d of drift) questions.push(`${d} Rebalance, or change the target?`)
  if (accounts.some((a) => a.change < 0)) questions.push('Some accounts are worth less than was put in. Is that expected, and what are the costs?')
  if (questions.length === 0) questions.push('Is the current plan on track for each goal, and what costs and taxes apply to it?')

  return {
    generatedOn: i.today,
    about: { age: ageIn(investor, Number(i.today.slice(0, 4))) ?? null, work: labelOf(EMPLOYMENT, investor.employment), income: labelOf(INCOME_STABILITY, investor.incomeStability) },
    risk: {
      ability: ab.level,
      abilityFactors: ab.factors,
      willingness: will.level,
      answered: will.answered,
      total: will.total,
      need,
      together: togetherNote(ab.level, will.level, need, stretch),
    },
    goals: scenarios,
    warnings,
    plans,
    accounts,
    allocation,
    drift,
    holdings,
    gaps,
    questions,
    notice: REVIEW_NOTICE,
  }
}

/** The goals paid for from investments, as the adviser sees them: what is set aside, the monthly saving and the return needed. */
export function planView(i: ReviewInput) {
  const r = buildReview(i)
  return { generatedOn: r.generatedOn, goals: r.goals, plans: r.plans, risk: r.risk, warnings: r.warnings, notice: r.notice }
}
