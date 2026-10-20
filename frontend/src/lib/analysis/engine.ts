/**
 * Financial review engine. Pure functions over the Ledger, run on the user's device.
 *
 * Everything here is deterministic: the numbers (net worth, cash flow, forecast, gaps) are
 * computed, never guessed. The AI agent (ADR-002) explains and builds on these results by calling
 * the same functions as tools, so it cannot invent figures.
 *
 * All amounts are in one currency (the "base" currency); rows in other currencies are counted
 * separately and reported as left out, never converted with made-up rates.
 */

import type { Transaction } from '../ledger/types'
import { accountType, type Account, type BalanceEntry, type Goal, type AccountGroup } from '../ledger/portfolio'
import { isTransfer, payeeKey } from '../ledger/categorize'
import { shiftMonth, ym } from '../ledger/summary'
import { formatNumber } from '../ledger/money'

export interface ReviewInput {
  transactions: Transaction[]
  accounts: Account[]
  balances?: BalanceEntry[]
  goals: Goal[]
  /** Optional profile facts */
  profile?: { country?: string; householdSize?: number; hasDependents?: boolean }
  /** Today, YYYY-MM-DD (passed in so results are reproducible) */
  today: string
  /** Currency to analyse; defaults to the most used one */
  currency?: string
}

const r2 = (x: number) => Math.round(x * 100) / 100
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10)
const monthsUntil = (today: string, date: string) => {
  const [y1, m1] = today.split('-').map(Number)
  const [y2, m2] = date.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/** Categories that are hard to cut: what an emergency fund has to cover. */
export const ESSENTIAL_CATEGORIES = ['Housing', 'Groceries', 'Utilities', 'Insurance', 'Health', 'Transport', 'Mobile & internet', 'Childcare', 'Loan & EMI', 'Taxes', 'Education']
const SAVING_CATEGORY = 'Savings & investments'

// ---------------------------------------------------------------------------------------------
// Base currency

export function baseCurrency(input: Pick<ReviewInput, 'transactions' | 'accounts' | 'currency'>): string {
  if (input.currency) return input.currency
  const n = new Map<string, number>()
  for (const t of input.transactions) n.set(t.currency, (n.get(t.currency) ?? 0) + 1)
  for (const a of input.accounts) n.set(a.currency, (n.get(a.currency) ?? 0) + 3)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR'
}

// ---------------------------------------------------------------------------------------------
// Net worth

export interface NetWorth {
  currency: string
  assets: number
  liabilities: number
  netWorth: number
  liquid: number
  byGroup: Record<Exclude<AccountGroup, 'cover'>, number>
  /** Investment and retirement split by account type, largest first */
  allocation: Array<{ type: string; label: string; amount: number; share: number }>
  /** Accounts in other currencies, not included above */
  otherCurrencies: Array<{ currency: string; count: number }>
  /** Accounts whose balance is older than 60 days */
  stale: Account[]
}

export function netWorth(accounts: Account[], currency: string, today: string): NetWorth {
  const byGroup = { cash: 0, investments: 0, retirement: 0, property: 0, debt: 0 }
  let liquid = 0
  const alloc = new Map<string, number>()
  const other = new Map<string, number>()
  const stale: Account[] = []
  for (const a of accounts) {
    const t = accountType(a.type)
    if (t.group === 'cover') continue
    if (a.currency !== currency) {
      other.set(a.currency, (other.get(a.currency) ?? 0) + 1)
      continue
    }
    byGroup[t.group] += a.balance
    if (t.liquid) liquid += a.balance
    if (t.group === 'investments' || t.group === 'retirement') alloc.set(t.value, (alloc.get(t.value) ?? 0) + a.balance)
    if (a.asOf && daysBetween(a.asOf, today) > 60) stale.push(a)
  }
  const assets = byGroup.cash + byGroup.investments + byGroup.retirement + byGroup.property
  const invested = byGroup.investments + byGroup.retirement
  return {
    currency,
    assets: r2(assets),
    liabilities: r2(byGroup.debt),
    netWorth: r2(assets - byGroup.debt),
    liquid: r2(liquid),
    byGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, r2(v)])) as NetWorth['byGroup'],
    allocation: [...alloc.entries()]
      .map(([type, amount]) => ({ type, label: accountType(type).label, amount: r2(amount), share: invested ? amount / invested : 0 }))
      .sort((a, b) => b.amount - a.amount),
    otherCurrencies: [...other.entries()].map(([c, count]) => ({ currency: c, count })),
    stale,
  }
}

/** Net worth at the end of each month, from the Balances history (latest entry per account). */
export function netWorthHistory(accounts: Account[], balances: BalanceEntry[], currency: string, endMonth: string, months = 12) {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  return Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(endMonth, i - (months - 1))
    let value = 0
    let known = 0
    for (const a of byId.values()) {
      const t = accountType(a.type)
      if (t.group === 'cover' || a.currency !== currency) continue
      const latest = balances
        .filter((b) => b.accountId === a.id && ym(b.date) <= month)
        .sort((x, y) => x.date.localeCompare(y.date) || x.recordedAt.localeCompare(y.recordedAt))
        .pop()
      if (!latest) continue
      known++
      value += t.group === 'debt' ? -latest.balance : latest.balance
    }
    return { month, netWorth: r2(value), accountsKnown: known }
  })
}

// ---------------------------------------------------------------------------------------------
// Cash flow

export interface MonthFlow {
  month: string
  income: number
  /** Everything going out except transfers and saving/investing */
  spending: number
  essential: number
  /** Money put into savings and investments */
  saved: number
}

export interface CashFlow {
  currency: string
  /** Complete months used for the averages, oldest first */
  months: MonthFlow[]
  avgIncome: number
  avgSpending: number
  avgEssential: number
  avgSaved: number
  /** Share of income not spent: (income − spending) / income */
  savingsRate: number | null
  /** Lowest and highest monthly spending seen, for the forecast range */
  spendingRange: [number, number]
  incomeRange: [number, number]
  byCategory: Array<{ category: string; monthly: number; essential: boolean }>
}

/** Monthly flows for the last `months` complete months (the current month is excluded as it is not over). */
export function cashFlow(transactions: Transaction[], currency: string, today: string, months = 6): CashFlow {
  const thisMonth = ym(today)
  const window = Array.from({ length: months }, (_, i) => shiftMonth(thisMonth, i - months))
  const inWindow = transactions.filter((t) => t.currency === currency && !isTransfer(t) && window.includes(ym(t.date)))
  // Only months that have any data, so a new user isn't averaged down by empty months
  const active = window.filter((m) => inWindow.some((t) => ym(t.date) === m))
  const flows: MonthFlow[] = active.map((month) => {
    const tx = inWindow.filter((t) => ym(t.date) === month)
    const out = tx.filter((t) => t.direction === 'out')
    const saved = sum(out.filter((t) => t.category === SAVING_CATEGORY).map((t) => t.amount))
    const spending = sum(out.filter((t) => t.category !== SAVING_CATEGORY).map((t) => t.amount))
    return {
      month,
      income: r2(sum(tx.filter((t) => t.direction === 'in').map((t) => t.amount))),
      spending: r2(spending),
      essential: r2(sum(out.filter((t) => ESSENTIAL_CATEGORIES.includes(t.category)).map((t) => t.amount))),
      saved: r2(saved),
    }
  })
  const n = flows.length || 1
  const avgIncome = sum(flows.map((f) => f.income)) / n
  const avgSpending = sum(flows.map((f) => f.spending)) / n
  const cats = new Map<string, number>()
  for (const t of inWindow) if (t.direction === 'out' && t.category !== SAVING_CATEGORY) cats.set(t.category || 'Other', (cats.get(t.category || 'Other') ?? 0) + t.amount)
  return {
    currency,
    months: flows,
    avgIncome: r2(avgIncome),
    avgSpending: r2(avgSpending),
    avgEssential: r2(sum(flows.map((f) => f.essential)) / n),
    avgSaved: r2(sum(flows.map((f) => f.saved)) / n),
    savingsRate: avgIncome > 0 ? (avgIncome - avgSpending) / avgIncome : null,
    spendingRange: flows.length ? [Math.min(...flows.map((f) => f.spending)), Math.max(...flows.map((f) => f.spending))] : [0, 0],
    incomeRange: flows.length ? [Math.min(...flows.map((f) => f.income)), Math.max(...flows.map((f) => f.income))] : [0, 0],
    byCategory: [...cats.entries()]
      .map(([category, total]) => ({ category, monthly: r2(total / n), essential: ESSENTIAL_CATEGORIES.includes(category) }))
      .sort((a, b) => b.monthly - a.monthly),
  }
}

// ---------------------------------------------------------------------------------------------
// Recurring payments

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'
const CADENCE_DAYS: Record<Cadence, [number, number, number]> = {
  // [min gap, max gap, months per occurrence]
  weekly: [6, 8, 12 / 52],
  monthly: [25, 35, 1],
  quarterly: [85, 97, 3],
  yearly: [350, 380, 12],
}

export interface Recurring {
  key: string
  name: string
  category: string
  direction: Transaction['direction']
  cadence: Cadence
  amount: number
  monthly: number
  lastDate: string
  nextDate: string
  count: number
  /** True when it was last seen longer ago than its cadence allows (probably ended) */
  lapsed: boolean
}

/** Finds subscriptions, rent, salary and other payments that repeat at a steady rhythm. */
export function recurring(transactions: Transaction[], currency: string, today: string): Recurring[] {
  const since = addDays(today, -400)
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.currency !== currency || isTransfer(t) || t.date < since) continue
    const key = `${t.direction}|${payeeKey(t.description)}`
    if (key.endsWith('|')) continue
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const out: Recurring[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const amounts = sorted.map((t) => t.amount)
    const typical = median(amounts)
    // Amounts must be steady (within 20%) for most occurrences
    const steady = amounts.filter((a) => Math.abs(a - typical) <= Math.max(1, typical * 0.2)).length / amounts.length
    if (steady < 0.75) continue
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date)).filter((g) => g > 0)
    if (!gaps.length) continue
    const gap = median(gaps)
    const cadence = (Object.keys(CADENCE_DAYS) as Cadence[]).find((c) => gap >= CADENCE_DAYS[c][0] && gap <= CADENCE_DAYS[c][1])
    if (!cadence) continue
    const needed = cadence === 'yearly' ? 2 : 3
    if (sorted.length < needed) continue
    const last = sorted[sorted.length - 1]
    const nextDate = addDays(last.date, Math.round(gap))
    out.push({
      key,
      name: last.description,
      category: last.category,
      direction: last.direction,
      cadence,
      amount: r2(typical),
      monthly: r2(typical / CADENCE_DAYS[cadence][2]),
      lastDate: last.date,
      nextDate,
      count: sorted.length,
      lapsed: daysBetween(nextDate, today) > CADENCE_DAYS[cadence][1] - CADENCE_DAYS[cadence][0] + 10,
    })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}

// ---------------------------------------------------------------------------------------------
// Goals

export interface GoalStatus {
  goal: Goal
  saved: number
  progress: number
  monthsLeft: number | null
  /** Monthly amount needed to reach the target on time */
  requiredMonthly: number | null
  /** When the target is reached at the current monthly amount (YYYY-MM), or null if never */
  projectedMonth: string | null
  status: 'done' | 'on-track' | 'behind' | 'no-plan' | 'no-date'
}

export function goalStatus(goals: Goal[], accounts: Account[], today: string): GoalStatus[] {
  const month = ym(today)
  return goals.map((goal) => {
    const linked = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined
    const saved = linked ? linked.balance : goal.saved
    const monthly = goal.monthly || linked?.monthly || 0
    const remaining = Math.max(0, goal.target - saved)
    const monthsLeft = goal.targetDate ? Math.max(0, monthsUntil(today, goal.targetDate)) : null
    const requiredMonthly = monthsLeft !== null ? (monthsLeft > 0 ? remaining / monthsLeft : remaining) : null
    const projectedMonth = remaining === 0 ? month : monthly > 0 ? shiftMonth(month, Math.ceil(remaining / monthly)) : null
    let status: GoalStatus['status']
    if (remaining === 0) status = 'done'
    else if (!goal.targetDate) status = monthly > 0 ? 'no-date' : 'no-plan'
    else if (monthly <= 0) status = 'no-plan'
    else status = projectedMonth && projectedMonth <= goal.targetDate.slice(0, 7) ? 'on-track' : 'behind'
    return {
      goal,
      saved: r2(saved),
      progress: goal.target ? Math.min(1, saved / goal.target) : 0,
      monthsLeft,
      requiredMonthly: requiredMonthly === null ? null : r2(requiredMonthly),
      projectedMonth,
      status,
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Forecast

export interface ForecastPoint {
  month: string
  liquid: number
  liquidLow: number
  liquidHigh: number
  invested: number
  debt: number
  netWorth: number
}

/** Expenses are padded by this share in every forecast, so the estimate errs on the cautious side. */
export const FORECAST_SAFETY_MARGIN = 0.1

/** The monthly changes behind the forecast, so each one can be shown and questioned. */
export interface ForecastDrivers {
  /** Complete months the averages come from */
  basisMonths: number
  /** Average money in per month */
  income: number
  /** Average spending per month, before the margin */
  spending: number
  /** Safety margin on spending per month */
  margin: number
  /** Moved from cash into savings and investments per month */
  saving: number
  /** Interest on cash per month */
  interest: number
  /** Change in cash per month (the middle case) */
  net: number
  /** Cash today */
  cashNow: number
}

export interface Forecast {
  currency: string
  months: number
  points: ForecastPoint[]
  /** What the projection assumes, in plain words, so the user can judge it */
  assumptions: string[]
  /** First month the cash buffer is projected to drop below zero (pessimistic case) */
  cashRunsOutMonth: string | null
  drivers: ForecastDrivers
}

/**
 * Projects cash, investments and debt month by month.
 * Cash: income − spending − money moved into savings/investments, using the recent average,
 * with a low/high band from the best and worst recent months.
 * Investments and retirement: monthly contributions plus the yearly rate (account's own, or the type default).
 * Debts: monthly payment minus interest reduces the balance (the payment itself is already in spending).
 */
export function forecast(input: ReviewInput, months = 12): Forecast {
  const currency = baseCurrency(input)
  const flow = cashFlow(input.transactions, currency, input.today)
  const mine = input.accounts.filter((a) => a.currency === currency)
  const growth = mine.filter((a) => ['investments', 'retirement'].includes(accountType(a.type).group))
  // Paying into a savings account keeps the money in cash, so only investments and pensions count here
  const plannedContrib = sum(growth.map((a) => a.monthly))
  // Money leaving cash for saving: the user's stated plans, or what the Ledger shows
  const contrib = plannedContrib || flow.avgSaved
  const nw = netWorth(input.accounts, currency, input.today)
  let otherCash = nw.byGroup.cash - nw.liquid
  const property = nw.byGroup.property
  const interest = (types: string[]) =>
    sum(mine.filter((a) => types.includes(a.type)).map((a) => (a.balance * (a.rate ?? accountType(a.type).defaultRate)) / 100 / 12))
  const liquidInterest = interest(['savings', 'current'])
  const lockedInterest = interest(['fixed_deposit'])

  // Spending is padded by the safety margin; income is never inflated, so the estimate errs on the cautious side
  const margin = flow.avgSpending * FORECAST_SAFETY_MARGIN
  const netMid = flow.avgIncome - flow.avgSpending - margin - contrib
  const netLow = flow.incomeRange[0] - flow.spendingRange[1] * (1 + FORECAST_SAFETY_MARGIN) - contrib
  const netHigh = flow.incomeRange[1] - flow.spendingRange[0] * (1 + FORECAST_SAFETY_MARGIN) - contrib

  let liquid = nw.liquid
  let low = nw.liquid
  let high = nw.liquid
  const balances = new Map(mine.map((a) => [a.id, a.balance]))
  const start = ym(input.today)
  const points: ForecastPoint[] = []
  let cashRunsOutMonth: string | null = null
  for (let i = 1; i <= months; i++) {
    const month = shiftMonth(start, i)
    liquid += netMid + liquidInterest
    low += netLow + liquidInterest
    high += netHigh + liquidInterest
    otherCash += lockedInterest
    let invested = 0
    let debt = 0
    for (const a of mine) {
      const t = accountType(a.type)
      const rate = (a.rate ?? t.defaultRate) / 100 / 12
      let b = balances.get(a.id) ?? 0
      if (t.group === 'investments' || t.group === 'retirement') {
        b = b * (1 + rate) + a.monthly
        invested += b
      } else if (t.group === 'debt') {
        b = Math.max(0, b * (1 + rate) - a.monthly)
        debt += b
      }
      balances.set(a.id, b)
    }
    // Contributions without a matching account still leave cash: keep them as invested money
    if (!plannedContrib && contrib > 0) invested += contrib * i
    if (low < 0 && !cashRunsOutMonth) cashRunsOutMonth = month
    points.push({
      month,
      liquid: r2(liquid),
      liquidLow: r2(low),
      liquidHigh: r2(high),
      invested: r2(invested),
      debt: r2(debt),
      netWorth: r2(liquid + otherCash + invested + property - debt),
    })
  }

  const assumptions = [
    flow.months.length
      ? `Income and spending follow your average of the last ${flow.months.length} complete month${flow.months.length > 1 ? 's' : ''} (in ${Math.round(flow.avgIncome)} / out ${Math.round(flow.avgSpending)} ${currency} a month).`
      : 'No complete month of transactions yet, so cash only changes by planned contributions.',
    `Spending is padded by ${Math.round(FORECAST_SAFETY_MARGIN * 100)}% (${Math.round(margin)} ${currency} a month) so the estimate errs on the cautious side.`,
    contrib > 0 ? `${Math.round(contrib)} ${currency} a month moves from cash into savings and investments${plannedContrib ? ' (from your accounts)' : ' (as seen in your Ledger)'}.` : 'No regular saving or investing is planned.',
    growth.length ? 'Investments grow at each account’s rate, or a cautious default for its type; real returns go up and down.' : 'No investment accounts recorded.',
    'The range shows your best and worst recent months repeated. Nothing is adjusted for inflation or tax.',
  ]
  const drivers: ForecastDrivers = {
    basisMonths: flow.months.length,
    income: flow.avgIncome,
    spending: flow.avgSpending,
    margin: r2(margin),
    saving: r2(contrib),
    interest: r2(liquidInterest),
    net: r2(netMid + liquidInterest),
    cashNow: nw.liquid,
  }
  return { currency, months, points, assumptions, cashRunsOutMonth, drivers }
}

// ---------------------------------------------------------------------------------------------
// Gaps

export type Severity = 'high' | 'medium' | 'low' | 'info'
export type Area = 'Safety net' | 'Cash flow' | 'Debt' | 'Investing' | 'Retirement' | 'Protection' | 'Goals' | 'Spending' | 'Data'

export interface Gap {
  id: string
  area: Area
  severity: Severity
  title: string
  detail: string
  /** A concrete next step */
  action: string
  /** Optional numbers behind the finding, for the agent and charts */
  metric?: { label: string; value: number; target?: number; unit: 'months' | 'percent' | 'money' }
}

const LIABILITY_COUNTRIES = ['DE', 'AT', 'CH', 'NL']

export function findGaps(input: ReviewInput): Gap[] {
  const currency = baseCurrency(input)
  const flow = cashFlow(input.transactions, currency, input.today)
  const nw = netWorth(input.accounts, currency, input.today)
  const goals = goalStatus(input.goals.filter((g) => g.currency === currency), input.accounts, input.today)
  const subs = recurring(input.transactions, currency, input.today)
  const gaps: Gap[] = []
  const fmt = (n: number) => `${formatNumber(Math.round(n), currency, 0)} ${currency}`
  const hasAccounts = input.accounts.length > 0
  const hasCompleteMonth = flow.months.length > 0

  // Data first: without it, other checks are unreliable
  if (!hasAccounts) {
    gaps.push({ id: 'data-accounts', area: 'Data', severity: 'info', title: 'Add your accounts', detail: 'Net worth, the emergency fund check and the forecast need your balances: current and savings accounts, investments, pension, loans and insurance.', action: 'Add each account with its current balance on the Accounts page.' })
  }
  if (!hasCompleteMonth) {
    gaps.push({ id: 'data-transactions', area: 'Data', severity: 'info', title: 'Import a full month of transactions', detail: 'Cash flow and the savings rate are based on complete months. The current month is left out until it is over.', action: 'Import last month’s bank statement (CSV or PDF).' })
  } else if (flow.avgIncome === 0) {
    gaps.push({ id: 'data-income', area: 'Data', severity: 'info', title: 'No income recorded', detail: 'No money in was found in the last complete months, so the savings rate cannot be worked out.', action: 'Import the account your salary is paid into, or add your income.' })
  }
  if (nw.stale.length) {
    gaps.push({ id: 'data-stale', area: 'Data', severity: 'low', title: `${nw.stale.length} balance${nw.stale.length > 1 ? 's are' : ' is'} out of date`, detail: `${nw.stale.map((a) => a.name).slice(0, 4).join(', ')} ${nw.stale.length > 1 ? 'were' : 'was'} last updated more than 60 days ago.`, action: 'Update the balances so net worth and the forecast stay accurate.' })
  }

  // Safety net
  if (hasAccounts && hasCompleteMonth) {
    const essential = flow.avgEssential || flow.avgSpending * 0.7
    const target = input.profile?.hasDependents ? 6 : 3
    const monthsCovered = essential > 0 ? nw.liquid / essential : 0
    if (essential > 0 && monthsCovered < target) {
      gaps.push({
        id: 'emergency-fund',
        area: 'Safety net',
        severity: monthsCovered < 1 ? 'high' : 'medium',
        title: monthsCovered < 1 ? 'No emergency fund yet' : 'Emergency fund is thin',
        detail: `Cash you can reach quickly (${fmt(nw.liquid)}) covers ${monthsCovered.toFixed(1)} months of essential costs (${fmt(essential)} a month). ${target} months is a common minimum${input.profile?.hasDependents ? ' with people depending on you' : ''}.`,
        action: `Build it up to about ${fmt(essential * target)} in an instant-access savings account before investing more.`,
        metric: { label: 'Months covered', value: r2(monthsCovered), target, unit: 'months' },
      })
    }
    // Too much idle cash
    const idle = nw.liquid - essential * 6
    const idleCurrent = sum(input.accounts.filter((a) => a.currency === currency && ['current', 'cash'].includes(a.type)).map((a) => a.balance))
    if (essential > 0 && idle > essential * 3 && idleCurrent > essential * 4) {
      gaps.push({
        id: 'idle-cash',
        area: 'Investing',
        severity: 'low',
        title: 'Cash is sitting idle',
        detail: `About ${fmt(idle)} is above a 6-month safety buffer, and ${fmt(idleCurrent)} sits in accounts that pay no interest.`,
        action: 'Move the surplus you won’t need for several years into interest-bearing savings or long-term investments that suit your goals.',
        metric: { label: 'Above buffer', value: r2(idle), unit: 'money' },
      })
    }
  }

  // Cash flow
  if (hasCompleteMonth && flow.savingsRate !== null) {
    const rate = flow.savingsRate
    if (rate < 0) {
      gaps.push({ id: 'negative-cashflow', area: 'Cash flow', severity: 'high', title: 'Spending more than you earn', detail: `On average ${fmt(flow.avgSpending)} goes out and ${fmt(flow.avgIncome)} comes in each month: a gap of ${fmt(flow.avgSpending - flow.avgIncome)}.`, action: `Look at the largest categories first: ${flow.byCategory.slice(0, 3).map((c) => c.category).join(', ')}.`, metric: { label: 'Savings rate', value: r2(rate * 100), target: 20, unit: 'percent' } })
    } else if (rate < 0.1) {
      gaps.push({ id: 'low-savings', area: 'Cash flow', severity: 'medium', title: 'Little left over each month', detail: `About ${Math.round(rate * 100)}% of income is left after spending. Many plans aim for 15–20%.`, action: `Raising it to 15% means about ${fmt(flow.avgIncome * 0.15 - (flow.avgIncome - flow.avgSpending))} less spending a month.`, metric: { label: 'Savings rate', value: r2(rate * 100), target: 20, unit: 'percent' } })
    } else if (rate < 0.2) {
      gaps.push({ id: 'ok-savings', area: 'Cash flow', severity: 'low', title: 'Savings rate could be higher', detail: `About ${Math.round(rate * 100)}% of income is left after spending.`, action: 'Automate a standing order to savings on payday so the rest is what you spend.', metric: { label: 'Savings rate', value: r2(rate * 100), target: 20, unit: 'percent' } })
    }
  }

  // Debt
  const costly = input.accounts.filter((a) => accountType(a.type).group === 'debt' && a.balance > 0 && (a.type === 'credit_card' || (a.rate ?? accountType(a.type).defaultRate) >= 8))
  if (costly.length) {
    const total = sum(costly.filter((a) => a.currency === currency).map((a) => a.balance))
    gaps.push({ id: 'costly-debt', area: 'Debt', severity: 'high', title: 'Expensive debt', detail: `${costly.map((a) => `${a.name} (${a.rate ?? accountType(a.type).defaultRate}%)`).join(', ')}: ${fmt(total)} in total. Interest this high usually costs more than investments earn.`, action: 'Pay these off first, highest rate first, before investing beyond your emergency fund.', metric: { label: 'Expensive debt', value: r2(total), unit: 'money' } })
  }
  const payments = sum(input.accounts.filter((a) => accountType(a.type).group === 'debt' && a.currency === currency).map((a) => a.monthly))
  if (flow.avgIncome > 0 && payments / flow.avgIncome > 0.35) {
    gaps.push({ id: 'debt-load', area: 'Debt', severity: 'medium', title: 'Loan payments take a large share of income', detail: `Loan and card payments of ${fmt(payments)} are ${Math.round((payments / flow.avgIncome) * 100)}% of income. Lenders usually look for under 35–40%.`, action: 'Avoid new credit and check whether refinancing at a lower rate is possible.', metric: { label: 'Debt payments / income', value: r2((payments / flow.avgIncome) * 100), target: 35, unit: 'percent' } })
  }

  // Retirement and investing
  if (hasAccounts && nw.byGroup.retirement === 0) {
    gaps.push({ id: 'no-retirement', area: 'Retirement', severity: 'medium', title: 'No retirement savings recorded', detail: 'No pension or retirement account is in your Ledger. State pensions alone often replace well under half of a salary.', action: input.profile?.country === 'IN' ? 'Add your EPF, PPF or NPS account, or look into starting one.' : 'Add your company pension (bAV), Riester/Rürup or private pension, or look into starting one.' })
  }
  if (nw.allocation.length && nw.allocation[0].share > 0.8 && nw.byGroup.investments + nw.byGroup.retirement > 10_000 && ['shares', 'crypto'].includes(nw.allocation[0].type)) {
    gaps.push({ id: 'concentration', area: 'Investing', severity: 'medium', title: `Most investments are in ${nw.allocation[0].label.toLowerCase()}`, detail: `${Math.round(nw.allocation[0].share * 100)}% of invested money is in one kind of holding, which makes results swing more.`, action: 'Consider spreading new money across more holdings, for example broad index funds.' })
  }

  // Protection
  const covers = new Set(input.accounts.filter((a) => accountType(a.type).group === 'cover').map((a) => a.type))
  const paysInsurance = input.transactions.some((t) => t.category === 'Insurance')
  const country = input.profile?.country
  if (hasAccounts) {
    if (!covers.has('ins_liability') && (!country || LIABILITY_COUNTRIES.includes(country))) {
      gaps.push({ id: 'no-liability', area: 'Protection', severity: 'medium', title: 'No personal liability insurance recorded', detail: `Personal liability (Haftpflicht) covers damage you cause to others, which can be very expensive. It is cheap and widely recommended${country === 'DE' ? ' in Germany' : ''}.${paysInsurance ? ' You do pay insurance premiums; add the policies so they can be checked.' : ''}`, action: 'Add your policy on the Accounts page, or compare offers.' })
    }
    if (!covers.has('ins_disability') && flow.avgIncome > 0) {
      gaps.push({ id: 'no-disability', area: 'Protection', severity: 'low', title: 'Income not protected', detail: 'If illness stopped you working, disability or income protection (BU) would replace part of your salary.', action: 'Check what your employer and state cover, then decide whether private cover is worth it.' })
    }
    if (input.profile?.hasDependents && !covers.has('ins_life')) {
      gaps.push({ id: 'no-life', area: 'Protection', severity: 'medium', title: 'No life insurance recorded', detail: 'People depend on your income. Term life insurance pays them a sum if you die during the term.', action: 'Add your policy, or look at term life cover of several years of income.' })
    }
  }

  // Goals
  for (const g of goals) {
    if (g.status === 'behind') {
      gaps.push({ id: `goal-${g.goal.id}`, area: 'Goals', severity: g.goal.priority === 'high' ? 'medium' : 'low', title: `“${g.goal.name}” is behind`, detail: `At ${fmt(g.goal.monthly)} a month it would be reached in ${g.projectedMonth ?? 'never'} instead of ${g.goal.targetDate.slice(0, 7)}.`, action: `Save about ${fmt(g.requiredMonthly ?? 0)} a month, or move the date.`, metric: { label: 'Needed per month', value: g.requiredMonthly ?? 0, unit: 'money' } })
    } else if (g.status === 'no-plan') {
      gaps.push({ id: `goal-${g.goal.id}`, area: 'Goals', severity: 'low', title: `“${g.goal.name}” has no monthly plan`, detail: g.requiredMonthly ? `To reach it on time you need about ${fmt(g.requiredMonthly)} a month.` : 'Without a monthly amount it cannot be tracked.', action: 'Set a monthly amount, ideally as a standing order on payday.' })
    }
  }
  if (hasAccounts && hasCompleteMonth && !input.goals.length) {
    gaps.push({ id: 'no-goals', area: 'Goals', severity: 'info', title: 'No goals yet', detail: 'Goals turn saving into a plan and let the forecast show when you get there.', action: 'Add one or two goals with an amount and a date.' })
  }

  // Spending
  const activeSubs = subs.filter((s) => s.direction === 'out' && !s.lapsed && s.category === 'Subscriptions')
  const subTotal = sum(activeSubs.map((s) => s.monthly))
  if (activeSubs.length >= 4 || (flow.avgIncome > 0 && subTotal > flow.avgIncome * 0.05)) {
    gaps.push({ id: 'subscriptions', area: 'Spending', severity: 'low', title: `${activeSubs.length} subscriptions, ${fmt(subTotal)} a month`, detail: activeSubs.slice(0, 6).map((s) => `${s.name} ${fmt(s.monthly)}`).join(' · '), action: 'Cancel the ones you no longer use; that is money saved every month.', metric: { label: 'Subscriptions per month', value: r2(subTotal), unit: 'money' } })
  }
  const last = flow.months[flow.months.length - 1]
  if (last && flow.months.length >= 3) {
    const prev = flow.months.slice(0, -1)
    const lastTx = input.transactions.filter((t) => t.currency === currency && ym(t.date) === last.month && t.direction === 'out' && !isTransfer(t) && t.category !== SAVING_CATEGORY)
    const cats = new Map<string, number>()
    for (const t of lastTx) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount)
    for (const [category, amount] of cats) {
      const before = sum(input.transactions.filter((t) => t.currency === currency && t.category === category && t.direction === 'out' && prev.some((p) => p.month === ym(t.date))).map((t) => t.amount)) / prev.length
      if (amount > before * 1.6 && amount - before > Math.max(100, flow.avgSpending * 0.05)) {
        gaps.push({ id: `spike-${category}`, area: 'Spending', severity: 'info', title: `${category} jumped in ${last.month}`, detail: `${fmt(amount)} against a usual ${fmt(before)}.`, action: 'Check whether this was a one-off or a new pattern.' })
      }
    }
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 }
  return gaps.sort((a, b) => order[a.severity] - order[b.severity])
}

// ---------------------------------------------------------------------------------------------
// Full review

export interface Review {
  currency: string
  generatedAt: string
  /** 0–100; null until there is enough data */
  score: number | null
  netWorth: NetWorth
  cashFlow: CashFlow
  recurring: Recurring[]
  goals: GoalStatus[]
  forecast: Forecast
  gaps: Gap[]
}

const PENALTY: Record<Severity, number> = { high: 15, medium: 8, low: 3, info: 0 }

export function review(input: ReviewInput): Review {
  const currency = baseCurrency(input)
  const cf = cashFlow(input.transactions, currency, input.today)
  const gaps = findGaps(input)
  const enough = input.accounts.length > 0 && cf.months.length > 0
  return {
    currency,
    generatedAt: new Date().toISOString(),
    score: enough ? Math.max(0, Math.min(100, 100 - sum(gaps.map((g) => PENALTY[g.severity])))) : null,
    netWorth: netWorth(input.accounts, currency, input.today),
    cashFlow: cf,
    recurring: recurring(input.transactions, currency, input.today),
    goals: goalStatus(input.goals.filter((g) => g.currency === currency), input.accounts, input.today),
    forecast: forecast({ ...input, currency }),
    gaps,
  }
}
