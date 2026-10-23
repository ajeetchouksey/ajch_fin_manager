import { test } from 'node:test'
import assert from 'node:assert/strict'
import { goalBand, goalProgress, investTotals, rankedGains, worthSeries } from '../src/lib/ledger/investViz.ts'
import { goalScenarios } from '../src/lib/ledger/scenarios.ts'
import type { Account, BalanceEntry, Goal } from '../src/lib/ledger/portfolio.ts'
import type { Plan } from '../src/lib/ledger/plans.ts'
import type { ReviewHolding } from '../src/lib/ledger/review.ts'

const TODAY = '2026-10-23'
const acc = (over: Partial<Account> = {}): Account => ({ id: 'a1', name: 'Depot', type: 'brokerage', institution: '', currency: 'EUR', balance: 12000, asOf: '2026-10-01', rate: null, monthly: 0, notes: '', createdAt: '', ...over })
const entry = (accountId: string, date: string, balance: number): BalanceEntry => ({ accountId, date, balance, recordedAt: date })

test('worth series follows recorded balances and carries the last one forward', () => {
  const history = [entry('a1', '2026-01-15', 9000), entry('a1', '2026-06-10', 10500)]
  const s = worthSeries([acc()], history, 'EUR', TODAY, 12)
  assert.equal(s.points.at(-1)!.date, TODAY)
  assert.equal(s.points.at(-1)!.value, 12000)
  const feb = s.points.find((p) => p.date === '2026-02-28')!
  assert.equal(feb.value, 9000)
  const jul = s.points.find((p) => p.date === '2026-07-31')!
  assert.equal(jul.value, 10500)
  // Nothing is invented before the first record
  assert.ok(s.points[0].date >= '2026-01-31')
  assert.deepEqual(s.joinedLater, [])
})

test('an account that joins later is named, and other kinds of account are left out', () => {
  const pension = acc({ id: 'a2', name: 'Pension', type: 'pension', balance: 5000, asOf: '2026-08-01' })
  const cash = acc({ id: 'a3', name: 'Savings', type: 'savings', balance: 999, asOf: '2026-01-01' })
  const s = worthSeries([acc(), pension, cash], [entry('a1', '2026-01-15', 9000)], 'EUR', TODAY, 12)
  assert.deepEqual(s.joinedLater, ['Pension'])
  assert.equal(s.points.at(-1)!.value, 17000)
  assert.equal(worthSeries([acc()], [], 'USD', TODAY).points.length, 0)
})

test('totals add worth and put in per currency and count only running plans', () => {
  const plan = (over: Partial<Plan>): Plan => ({ id: 'p', name: 'x', amount: 300, currency: 'EUR', frequency: 'monthly', startDate: '', endDate: '', goalId: '', accountId: '', notes: '', createdAt: '', ...over })
  const rows = [
    { id: 'a1', name: 'Depot', currency: 'EUR', worth: 12000, putIn: 10000, change: 2000, changeShare: 0.2, since: '2025-01-01' },
    { id: 'a2', name: 'Pension', currency: 'EUR', worth: 5000, putIn: 5000, change: 0, changeShare: 0, since: '2025-01-01' },
  ] as Parameters<typeof investTotals>[0]
  const [t] = investTotals(rows, [plan({}), plan({ id: 'q', startDate: '2027-01-01' }), plan({ id: 'r', endDate: '2026-01-01' })], TODAY)
  assert.equal(t.worth, 17000)
  assert.equal(t.putIn, 15000)
  assert.equal(t.change, 2000)
  assert.equal(t.changeShare, 0.1333)
  assert.equal(t.planned, 300)
})

test('a goal band runs from today to the goal date and the cases stay in order', () => {
  const goal: Goal = { id: 'g1', name: 'Home', target: 60000, currency: 'EUR', targetDate: '2032-10-01', saved: 0, monthly: 300, accountId: 'a1', priority: 'high', notes: '', createdAt: '' }
  const [s] = goalScenarios({ accounts: [acc({ balance: 10000 })], balances: [], transactions: [], goals: [goal], today: TODAY }, [])
  const b = goalBand(s)
  assert.equal(b.months, 72)
  assert.equal(b.series[0].values.length, 73)
  assert.equal(b.series[0].values[0], 10000)
  const end = b.series.map((c) => c.values.at(-1)!)
  assert.ok(end[0] < end[1] && end[1] < end[2])
  assert.equal(end[0], s.cases[0].value)
  assert.equal(goalProgress(s), 10000 / 60000)
  assert.equal(goalProgress({ current: 5, target: 0 }), 0)
  assert.equal(goalProgress({ current: 99, target: 10 }), 1)
})

test('ranked gains skip holdings without a price and put the best first', () => {
  const h = (name: string, gainShare: number | null, value: number | null) => ({ name, gainShare, value }) as ReviewHolding
  assert.deepEqual(rankedGains([h('a', 0.1, 1), h('b', null, null), h('c', 0.5, 1), h('d', -0.2, 1)]).map((x) => x.name), ['c', 'a', 'd'])
})
