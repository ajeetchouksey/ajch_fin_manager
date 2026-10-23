import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyEquivalent, planProblem, planState, plannedMonthly, planToRow, PLAN_COLUMNS, rowToPlan, type Plan } from '../src/lib/ledger/plans.ts'

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'plan-1', name: 'Index savings', amount: 200, currency: 'EUR', frequency: 'monthly', startDate: '', endDate: '', goalId: '', accountId: '', notes: '', createdAt: '2026-10-01T00:00:00Z', ...over,
})

test('a plan survives a round trip through a sheet row', () => {
  const p = plan({ startDate: '2026-12-01', endDate: '2030-12-31', goalId: 'goal-1', accountId: 'acc-1', notes: 'after the bonus' })
  const row = planToRow(p)
  assert.equal(row.length, PLAN_COLUMNS.length)
  assert.deepEqual(rowToPlan(row, 5), { ...p, row: 5 })
})

test('rows that cannot be read are skipped or repaired', () => {
  assert.equal(rowToPlan([], 2), null)
  const odd = rowToPlan(['p1', '', '-50', '', 'weekly', 'soon', '', '', '', '', ''], 2)
  assert.equal(odd?.amount, 50)
  assert.equal(odd?.frequency, 'monthly')
  assert.equal(odd?.startDate, '')
  assert.equal(odd?.currency, 'EUR')
})

test('monthly equivalents', () => {
  assert.equal(monthlyEquivalent({ amount: 200, frequency: 'monthly' }), 200)
  assert.equal(monthlyEquivalent({ amount: 300, frequency: 'quarterly' }), 100)
  assert.equal(monthlyEquivalent({ amount: 1200, frequency: 'yearly' }), 100)
  assert.equal(monthlyEquivalent({ amount: 5000, frequency: 'once' }), 0)
})

test('plan states depend on the dates', () => {
  const today = '2026-10-23'
  assert.equal(planState(plan(), today), 'running')
  assert.equal(planState(plan({ startDate: '2026-12-01' }), today), 'upcoming')
  assert.equal(planState(plan({ endDate: '2026-09-30' }), today), 'ended')
  assert.equal(planState(plan({ endDate: today }), today), 'running')
  assert.equal(planState(plan({ frequency: 'once', startDate: '2026-11-01' }), today), 'upcoming')
  assert.equal(planState(plan({ frequency: 'once', startDate: '2026-01-01' }), today), 'ended')
})

test('planned monthly totals per currency, optionally for one goal, ignoring ended and one-time plans', () => {
  const today = '2026-10-23'
  const plans = [
    plan({ id: 'a', amount: 200, goalId: 'g1' }),
    plan({ id: 'b', amount: 600, frequency: 'quarterly', goalId: 'g1' }),
    plan({ id: 'c', amount: 100, goalId: 'g2' }),
    plan({ id: 'd', amount: 999, endDate: '2026-01-01' }),
    plan({ id: 'e', amount: 5000, frequency: 'once', startDate: '2027-01-01' }),
    plan({ id: 'f', amount: 50, currency: 'INR' }),
  ]
  const all = plannedMonthly(plans, today)
  assert.equal(all.get('EUR'), 500)
  assert.equal(all.get('INR'), 50)
  assert.equal(plannedMonthly(plans, today, 'g1').get('EUR'), 400)
  assert.equal(plannedMonthly(plans, today, 'none').size, 0)
})

test('problems with a plan are named', () => {
  const ok = { name: 'x', amount: 10, frequency: 'monthly' as const, startDate: '', endDate: '' }
  assert.equal(planProblem(ok), null)
  assert.match(planProblem({ ...ok, name: ' ' }) ?? '', /name/)
  assert.match(planProblem({ ...ok, amount: 0 }) ?? '', /amount/)
  assert.match(planProblem({ ...ok, frequency: 'once' }) ?? '', /date/)
  assert.match(planProblem({ ...ok, startDate: '2027-01-01', endDate: '2026-01-01' }) ?? '', /before/)
})
