import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contributionFor, futureValue, goalScenarios, requiredMonthly, scenarioWarnings } from '../src/lib/ledger/scenarios.ts'
import { requiredReturn } from '../src/lib/ledger/risk.ts'
import type { Account, Goal } from '../src/lib/ledger/portfolio.ts'
import type { Plan } from '../src/lib/ledger/plans.ts'

const TODAY = '2026-10-23'
const money = (v: number, c: string) => `${v} ${c}`

const depot: Account = { id: 'acc-1', name: 'Depot', type: 'brokerage', institution: '', currency: 'EUR', balance: 10000, asOf: '2026-10-01', rate: null, monthly: 0, notes: '', createdAt: '' }
const cash: Account = { id: 'acc-2', name: 'Savings', type: 'savings', institution: '', currency: 'EUR', balance: 5000, asOf: '2026-10-01', rate: null, monthly: 0, notes: '', createdAt: '' }
const goal = (over: Partial<Goal> = {}): Goal => ({ id: 'g1', name: 'Home deposit', target: 60000, currency: 'EUR', targetDate: '2032-10-01', saved: 0, monthly: 300, accountId: 'acc-1', priority: 'high', notes: '', createdAt: '', ...over })
const plan = (over: Partial<Plan> = {}): Plan => ({ id: 'p1', name: 'Investing', amount: 300, currency: 'EUR', frequency: 'monthly', startDate: '', endDate: '', goalId: 'g1', accountId: '', notes: '', createdAt: '', ...over })
const data = (goals: Goal[], accounts = [depot, cash]) => ({ accounts, balances: [], transactions: [], goals, today: TODAY })

test('future value and the monthly amount that reaches a target agree', () => {
  assert.equal(futureValue(1000, 100, 12, 0), 2200)
  const fv = futureValue(1000, 100, 120, 0.05)
  assert.ok(fv > 1000 + 100 * 120)
  const need = requiredMonthly(1000, 120, fv, 0.05)
  assert.ok(Math.abs(need - 100) <= 1, String(need))
  assert.equal(requiredMonthly(5000, 12, 4000, 0.03), 0)
  assert.equal(requiredMonthly(0, 0, 500, 0.03), 500)
})

test('a scenario lands between the no-growth and stronger cases, and agrees with the needed return', () => {
  const [s] = goalScenarios(data([goal()]), [])
  assert.equal(s.months, 72)
  assert.equal(s.current, 10000)
  assert.deepEqual(s.cases.map((c) => c.id), ['flat', 'modest', 'strong'])
  assert.ok(s.cases[0].value < s.cases[1].value && s.cases[1].value < s.cases[2].value)
  assert.equal(s.cases[0].value, 10000 + 300 * 72)
  assert.equal(s.cases[0].reaches, false)
  assert.equal(s.cases[0].short, 60000 - s.cases[0].value)
  assert.equal(s.neededRate, requiredReturn(10000, 300, 72, 60000))
  // At the needed return the goal is reached
  assert.ok(requiredMonthly(10000, 72, 60000, s.neededRate!) <= 301)
})

test('only goals paid from an investment account with a date and money still to find are shown', () => {
  const goals = [
    goal({ id: 'cashgoal', accountId: 'acc-2' }),
    goal({ id: 'nodate', targetDate: '' }),
    goal({ id: 'past', targetDate: '2026-01-01' }),
    goal({ id: 'done', target: 5000 }),
    goal({ id: 'ok' }),
  ]
  assert.deepEqual(goalScenarios(data(goals), []).map((s) => s.id), ['ok'])
})

test('linked plans replace the goal monthly saving; ended and one-time plans are left out', () => {
  assert.deepEqual(contributionFor('g1', 300, 'EUR', [], TODAY), { monthly: 300, source: 'goal' })
  assert.deepEqual(contributionFor('g1', 300, 'EUR', [plan({ amount: 500 })], TODAY), { monthly: 500, source: 'plans' })
  assert.deepEqual(contributionFor('g1', 300, 'EUR', [plan({ amount: 600, frequency: 'quarterly' }), plan({ id: 'p2', amount: 50 })], TODAY), { monthly: 250, source: 'plans' })
  const ignored = [plan({ endDate: '2026-01-01' }), plan({ id: 'p3', frequency: 'once', startDate: '2027-01-01', amount: 9999 }), plan({ id: 'p4', goalId: 'other' }), plan({ id: 'p5', currency: 'INR' })]
  assert.deepEqual(contributionFor('g1', 300, 'EUR', ignored, TODAY), { monthly: 300, source: 'goal' })
  const [s] = goalScenarios(data([goal()]), [plan({ amount: 800 })])
  assert.equal(s.monthly, 800)
  assert.equal(s.source, 'plans')
})

test('warnings: out of reach, more than comfort, close date and plans that differ from the goal', () => {
  const warn = (g: Goal, a: 'low' | 'medium' | 'high' | null, w: 'low' | 'medium' | 'high' | null, plans: Plan[] = []) =>
    scenarioWarnings(goalScenarios(data([g]), plans), a, w, money).map((x) => x.id.split('-').pop())

  assert.deepEqual(warn(goal({ monthly: 10, target: 5_000_000 }), 'high', 'high'), ['stretch'])
  // Needs about 8% a year: more than a medium comfort level
  const eight = goal({ target: 45000 })
  assert.ok(warn(eight, 'high', 'medium').includes('comfort'))
  assert.ok(!warn(eight, 'high', 'high').includes('comfort'))
  assert.ok(!warn(eight, null, null).includes('comfort'))
  // About 17% a year is not a plan at any comfort level
  assert.deepEqual(warn(goal(), 'high', 'high'), ['stretch'])
  // Saving alone reaches it: nothing to say
  assert.deepEqual(warn(goal({ target: 20000, monthly: 500 }), 'low', 'low'), [])
  // Close date that relies on growth
  assert.ok(warn(goal({ targetDate: '2028-06-01', target: 20000, monthly: 100 }), 'high', 'high').includes('soon'))
  // Plans add up to something other than the goal's own monthly saving
  assert.ok(warn(goal({ monthly: 300 }), 'high', 'high', [plan({ amount: 600 })]).includes('differs'))
  assert.ok(!warn(goal({ monthly: 300 }), 'high', 'high', [plan({ amount: 305 })]).includes('differs'))
})
