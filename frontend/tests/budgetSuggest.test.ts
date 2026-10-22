import { test } from 'node:test'
import assert from 'node:assert/strict'
import { roundLimit, suggestLimits } from '../src/lib/ledger/budgetSuggest.ts'
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

const spans = [
  { start: '2026-07-01', end: '2026-07-31' },
  { start: '2026-08-01', end: '2026-08-31' },
  { start: '2026-09-01', end: '2026-09-30' },
]

test('limits round up to friendly steps', () => {
  assert.equal(roundLimit(0), 0)
  assert.equal(roundLimit(26.41), 30)
  assert.equal(roundLimit(198.75), 200)
  assert.equal(roundLimit(1377.67), 1400)
})

test('per-category amounts per period; the highest normal month becomes the suggestion', () => {
  const s = suggestLimits(
    [
      tx('2026-07-10', 'Groceries', 51.23),
      tx('2026-08-10', 'Groceries', 198.75),
      tx('2026-09-10', 'Groceries', 175.78),
      tx('2026-09-12', 'Subscriptions', 26.41),
      tx('2026-09-12', 'Transfer', 500),
      tx('2026-09-12', 'Salary', 4000, { direction: 'in' }),
      tx('2026-09-12', 'Groceries', 99, { currency: 'INR' }),
      tx('2026-06-30', 'Groceries', 999),
    ],
    spans,
    'EUR',
  )
  assert.deepEqual(s.map((x) => x.category), ['Groceries', 'Subscriptions'])
  assert.deepEqual(s[0].amounts, [51.23, 198.75, 175.78])
  assert.equal(s[0].suggested, 200)
  assert.equal(s[0].spike, undefined)
  assert.equal(s[1].suggested, 30)
})

test('a month with two rents is left out of the suggestion and reported', () => {
  const s = suggestLimits(
    [
      tx('2026-07-01', 'Housing', 1350.49),
      tx('2026-08-01', 'Housing', 1350.49),
      tx('2026-08-29', 'Housing', 1350.49),
      tx('2026-09-01', 'Housing', 1377.67),
    ],
    spans,
    'EUR',
  )[0]
  assert.deepEqual(s.spike, { index: 1, amount: 2700.98 })
  assert.equal(s.suggested, 1400)
})
