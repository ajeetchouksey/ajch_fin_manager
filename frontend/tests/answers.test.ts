import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expensiveMonth, monthlySpend, yearOnYear } from '../src/lib/analysis/answers.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

let n = 0
const tx = (date: string, category: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  date,
  direction: 'out',
  amount,
  currency: 'EUR',
  account: '',
  category,
  description: category,
  notes: '',
  tags: [],
  documentIds: [],
  source: 'manual',
  createdAt: '',
  ...over,
})

const ledger = [
  tx('2026-01-05', 'Housing', 1000),
  tx('2026-01-28', 'Salary', 3000, { direction: 'in' }),
  tx('2026-03-01', 'Housing', 1000),
  tx('2026-03-10', 'Travel', 2200, { description: 'Booking.com — hotel' }),
  tx('2026-03-12', 'Other', 40),
  tx('2026-03-14', 'Other', 60),
  tx('2026-03-20', 'Transfer', 5000),
  tx('2026-03-20', 'Groceries', 1000, { currency: 'INR' }),
]

test('monthly spending fills months without data and skips transfers and other currencies', () => {
  const m = monthlySpend(ledger, 'EUR', '2026')
  assert.deepEqual(m.map((x) => x.month), ['2026-01', '2026-02', '2026-03'])
  assert.equal(m[1].spending, 0)
  assert.equal(m[2].spending, 3300)
  assert.equal(m[0].income, 3000)
})

test('the most expensive month names its biggest payment and what is still in Other', () => {
  const e = expensiveMonth(ledger, 'EUR', '2026')!
  assert.equal(e.month, '2026-03')
  assert.equal(e.largest?.name, 'Booking.com')
  assert.equal(e.largest?.amount, 2200)
  assert.ok(Math.abs(e.largest!.share - 2200 / 3300) < 1e-9)
  assert.deepEqual(e.other, { amount: 100, count: 2 })
  assert.deepEqual(e.rest, [{ category: 'Housing', amount: 1000 }])
})

test('no spending gives no expensive month', () => {
  assert.equal(expensiveMonth([tx('2026-01-28', 'Salary', 3000, { direction: 'in' })], 'EUR', '2026'), null)
})

test('monthly spending starts at the first month with data', () => {
  const m = monthlySpend([tx('2026-07-02', 'Housing', 10), tx('2026-09-02', 'Housing', 10)], 'EUR', '2026')
  assert.deepEqual(m.map((x) => x.month), ['2026-07', '2026-08', '2026-09'])
})

test('year on year needs last year from January', () => {
  assert.deepEqual(yearOnYear(ledger, 'EUR'), { kind: 'no-history', firstMonth: '2026-01' })
  const both = [...ledger, tx('2025-01-03', 'Housing', 900), tx('2025-02-03', 'Housing', 900), tx('2025-11-03', 'Housing', 900)]
  const c = yearOnYear(both, 'EUR')
  assert.equal(c.kind, 'compare')
  if (c.kind === 'compare') {
    assert.equal(c.months, 3)
    assert.equal(c.thisYear, 4300)
    assert.equal(c.lastYear, 1800) // November is after March, so it is not compared
  }
  assert.deepEqual(yearOnYear([], 'EUR'), { kind: 'empty' })
})
