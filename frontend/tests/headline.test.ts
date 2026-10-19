import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, headlineLines, weekSpans } from '../src/lib/ledger/headline.ts'

const totals = (income: number, spending: number, count: number) => ({ income, spending, net: income - spending, count })

test('dates move across month and year boundaries', () => {
  assert.equal(addDays('2026-10-02', -6), '2026-09-26')
  assert.equal(addDays('2026-01-03', -6), '2025-12-28')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
})

test('the week is the last seven days including today, then the seven before', () => {
  const w = weekSpans('2026-10-19')
  assert.deepEqual(w.now, { start: '2026-10-13', end: '2026-10-19' })
  assert.deepEqual(w.before, { start: '2026-10-06', end: '2026-10-12' })
})

test('no transactions says so and nothing else', () => {
  assert.deepEqual(headlineLines(totals(0, 0, 0), totals(0, 0, 0), 'this month', 'last month', 'EUR'), ['No transactions this month.'])
})

test('a period with money out and in gives the spend, the income, and the comparison', () => {
  const lines = headlineLines(totals(1000, 800, 5), totals(1000, 1000, 4), 'this month', 'last month', 'EUR')
  assert.equal(lines.length, 3)
  assert.match(lines[0], /You spent .*800.*received .*1,000/)
  assert.match(lines[1], /You kept/)
  assert.equal(lines[2], 'Spending is 20% lower than last month.')
})

test('overspending is stated as such, and no comparison is made without an earlier period', () => {
  const lines = headlineLines(totals(100, 300, 3), totals(0, 0, 0), 'this week', 'the 7 days before', 'EUR')
  assert.match(lines[1], /more than you received/)
  assert.equal(lines.length, 2)
})
