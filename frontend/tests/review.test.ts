import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReview, planView, REVIEW_NOTICE, type ReviewInput } from '../src/lib/ledger/review.ts'
import type { Account, Goal } from '../src/lib/ledger/portfolio.ts'
import type { Holding } from '../src/lib/ledger/holdings.ts'
import type { Plan } from '../src/lib/ledger/plans.ts'
import type { Trade } from '../src/lib/ledger/trades.ts'

const TODAY = '2026-10-23'
const money = (v: number, c: string) => `${v} ${c}`

const depot: Account = { id: 'acc-1', name: 'Depot', type: 'brokerage', institution: '', currency: 'EUR', balance: 13200, asOf: '2026-10-01', rate: null, monthly: 0, notes: '', createdAt: '' }
const goal: Goal = { id: 'g1', name: 'Home deposit', target: 60000, currency: 'EUR', targetDate: '2032-10-01', saved: 0, monthly: 300, accountId: 'acc-1', priority: 'high', notes: '', createdAt: '' }
const plan: Plan = { id: 'p1', name: 'ETF savings plan', amount: 300, currency: 'EUR', frequency: 'monthly', startDate: '', endDate: '', goalId: 'g1', accountId: 'acc-1', notes: '', createdAt: '' }
const holding = { id: 'h1', accountId: 'acc-1', name: 'World equity ETF', isin: '', symbol: '', assetClass: 'funds', quantity: 120, avgCost: 90, currency: 'EUR', price: 110, priceDate: '2026-10-20', notes: '', createdAt: '' } as unknown as Holding
const trade = (over: Record<string, unknown>) => ({ id: 't', holdingId: 'h1', accountId: 'acc-1', date: '2024-01-15', type: 'buy', quantity: 120, price: 90, amount: 0, fee: 0, tax: 0, currency: 'EUR', notes: '', createdAt: '', ...over }) as unknown as Trade

const base = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  accounts: [depot],
  balances: [],
  transactions: [],
  goals: [goal],
  plans: [plan],
  holdings: [holding],
  trades: [],
  investor: { birthYear: 1988, employment: 'employed', incomeStability: 'stable' },
  today: TODAY,
  ...over,
})

test('the pack puts goals, plans, holdings and the notice together', () => {
  const r = buildReview(base(), money)
  assert.equal(r.generatedOn, TODAY)
  assert.equal(r.about.age, 38)
  assert.equal(r.about.work, 'Employed')
  assert.equal(r.goals.length, 1)
  assert.equal(r.plans.length, 1)
  assert.equal(r.plans[0].goal, 'Home deposit')
  assert.equal(r.plans[0].account, 'Depot')
  assert.equal(r.holdings[0].value, 13200)
  assert.equal(r.holdings[0].gain, 2400)
  assert.equal(r.notice, REVIEW_NOTICE)
  assert.ok(/not regulated advice/i.test(r.notice))
})

test('what is missing is said plainly', () => {
  const r = buildReview(base({ investor: {}, holdings: [], plans: [] }), money)
  const text = r.gaps.join(' | ')
  assert.match(text, /Year of birth/)
  assert.match(text, /risk questions are not answered/)
  assert.match(text, /No target mix/)
  assert.match(text, /No individual holdings/)
})

test('a holding without a price or with an old price is flagged', () => {
  const unpriced = { ...holding, price: null, priceDate: '' } as Holding
  assert.match(buildReview(base({ holdings: [unpriced] }), money).gaps.join(' | '), /no price/)
  const old = { ...holding, priceDate: '2026-01-01' } as Holding
  assert.match(buildReview(base({ holdings: [old] }), money).gaps.join(' | '), /older than 90 days/)
})

test('trades give the return and realised figures; holdings without trades give the simple gain', () => {
  const trades = [trade({ id: 't1' }), trade({ id: 't2', type: 'dividend', date: '2025-06-01', quantity: 0, price: 0, amount: 30 })]
  const r = buildReview(base({ trades }), money)
  assert.equal(r.holdings[0].dividends, 30)
  assert.ok(r.holdings[0].yearly !== null && r.holdings[0].yearly > 0)
  const plain = buildReview(base(), money)
  assert.equal(plain.holdings[0].yearly, null)
  assert.equal(plain.holdings[0].dividends, null)
})

test('questions come from the numbers and never name a product', () => {
  const hard = buildReview(base({ goals: [{ ...goal, target: 400000 }], plans: [] }), money)
  assert.ok(hard.questions.some((q) => q.includes('Home deposit')))
  const calm = buildReview(base({ goals: [], plans: [] }), money)
  assert.equal(calm.questions.length, 1)
  for (const q of [...hard.questions, ...calm.questions]) assert.doesNotMatch(q, /\b(buy|sell)\b/i)
})

test('drift from the target becomes a question', () => {
  const r = buildReview(base({ investor: { allocationTarget: { funds: 50, shares: 50 } } }), money)
  assert.ok(r.drift.length > 0)
  assert.ok(r.questions.some((q) => q.includes('Rebalance')))
})

test('the plan view is the goals, plans and risk part of the pack', () => {
  const v = planView(base())
  assert.equal(v.goals.length, 1)
  assert.ok('risk' in v && 'warnings' in v)
  assert.ok(!('holdings' in v))
})

test('an empty Ledger still gives a pack', () => {
  const r = buildReview({ accounts: [], balances: [], transactions: [], goals: [], plans: [], holdings: [], trades: [], today: TODAY }, money)
  assert.equal(r.goals.length, 0)
  assert.equal(r.holdings.length, 0)
  assert.ok(r.gaps.length > 0)
  assert.ok(r.questions.length === 1)
})
