import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byAccount, inSpan, spendingByCategory, totalsFor } from '../src/lib/ledger/summary.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `${date}-${amount}-${over.category ?? ''}`,
  date,
  direction: amount >= 0 ? 'in' : 'out',
  amount: Math.abs(amount),
  currency: 'EUR',
  account: 'Current',
  category: amount >= 0 ? 'Salary' : 'Groceries',
  description: 'x',
  notes: '',
  tags: [],
  documentIds: [],
  source: 'manual',
  createdAt: '',
  ...over,
})

// A salary cycle from 27 Sep to 26 Oct, with the next salary on 27 Oct
const cycleData = [
  tx('2026-09-27', 4200),
  tx('2026-10-05', -50),
  tx('2026-10-20', -30, { category: 'Dining', account: 'Savings' }),
  tx('2026-10-26', -20, { currency: 'USD' }),
  tx('2026-10-27', 4200),
]

test('a date range covers exactly its days, both ends included', () => {
  const span = { start: '2026-09-27', end: '2026-10-26' }
  assert.equal(inSpan('2026-09-27', span), true)
  assert.equal(inSpan('2026-10-26', span), true)
  assert.equal(inSpan('2026-10-27', span), false)
  assert.equal(inSpan('2026-09-26', span), false)
})

test('a month string still means the calendar month', () => {
  assert.equal(inSpan('2026-10-31', '2026-10'), true)
  assert.equal(inSpan('2026-11-01', '2026-10'), false)
})

test('totals for a salary cycle use only its days and currency', () => {
  const totals = totalsFor(cycleData, { start: '2026-09-27', end: '2026-10-26' }, 'EUR')
  assert.deepEqual(totals, { income: 4200, spending: 80, net: 4120, count: 3 })
})

test('totals for a calendar month exclude the days either side', () => {
  const october = totalsFor(cycleData, '2026-10', 'EUR')
  assert.deepEqual(october, { income: 4200, spending: 80, net: 4120, count: 3 })
  assert.deepEqual(totalsFor(cycleData, '2026-09', 'EUR'), { income: 4200, spending: 0, net: 4200, count: 1 })
})

test('category shares for a cycle add up to 1 and only include its spending', () => {
  const rows = spendingByCategory(cycleData, { start: '2026-09-27', end: '2026-10-26' }, 'EUR')
  assert.deepEqual(
    rows.map((r) => [r.category, r.amount]),
    [
      ['Groceries', 50],
      ['Dining', 30],
    ],
  )
  const shares = rows.reduce((s, r) => s + r.share, 0)
  assert.ok(Math.abs(shares - 1) < 1e-9)
})

test('accounts for a cycle list only that cycle', () => {
  const rows = byAccount(cycleData, { start: '2026-09-27', end: '2026-10-26' }, 'EUR')
  assert.deepEqual(
    rows.map((r) => [r.account, r.income, r.spending]),
    [
      ['Current', 4200, 50],
      ['Savings', 0, 30],
    ],
  )
})
