import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FORECAST_SAFETY_MARGIN, forecast, type ReviewInput } from '../src/lib/analysis/engine.ts'
import type { Account } from '../src/lib/ledger/portfolio.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (date: string, amount: number, category: string): Transaction => ({
  id: `${date}-${amount}-${category}`,
  date,
  direction: amount >= 0 ? 'in' : 'out',
  amount: Math.abs(amount),
  currency: 'EUR',
  account: 'Current',
  category,
  description: category,
  notes: '',
  tags: [],
  documentIds: [],
  source: 'manual',
  createdAt: '',
})

const current: Account = {
  id: 'a1',
  name: 'Current',
  type: 'current',
  institution: '',
  currency: 'EUR',
  balance: 1000,
  asOf: '2026-10-01',
  rate: null,
  monthly: 0,
  notes: '',
  createdAt: '',
}

// Two complete months before today: 3000 in (salary) and 2000 out (groceries) each month
const input = (): ReviewInput => ({
  transactions: [
    tx('2026-08-01', 3000, 'Salary'),
    tx('2026-08-10', -2000, 'Groceries'),
    tx('2026-09-01', 3000, 'Salary'),
    tx('2026-09-10', -2000, 'Groceries'),
  ],
  accounts: [current],
  goals: [],
  today: '2026-10-13',
  currency: 'EUR',
})

test('the safety margin is 10% and applies to spending only', () => {
  assert.equal(FORECAST_SAFETY_MARGIN, 0.1)
})

test('drivers show the monthly change behind the estimate', () => {
  const f = forecast(input(), 3)
  assert.equal(f.drivers.basisMonths, 2)
  assert.equal(f.drivers.income, 3000)
  assert.equal(f.drivers.spending, 2000)
  assert.equal(f.drivers.margin, 200)
  assert.equal(f.drivers.saving, 0)
  assert.equal(f.drivers.interest, 0)
  assert.equal(f.drivers.net, 800)
  assert.equal(f.drivers.cashNow, 1000)
})

test('cash projection uses the drivers: income minus spending plus margin', () => {
  const f = forecast(input(), 3)
  assert.deepEqual(
    f.points.map((p) => p.liquid),
    [1800, 2600, 3400],
  )
  assert.equal(f.points.length, 3)
})

test('the assumptions state the margin in plain words', () => {
  const f = forecast(input(), 3)
  assert.ok(f.assumptions.some((a) => /padded by 10% \(200 EUR a month\)/.test(a)), f.assumptions.join(' | '))
})

test('no complete months: drivers are zero and cash does not move', () => {
  const f = forecast({ ...input(), transactions: [] }, 2)
  assert.equal(f.drivers.basisMonths, 0)
  assert.equal(f.drivers.net, 0)
  assert.deepEqual(
    f.points.map((p) => p.liquid),
    [1000, 1000],
  )
})
