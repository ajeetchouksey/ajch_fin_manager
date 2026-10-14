import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUDGET_WARN_AT, budgetProgress, budgetToRow, rowToBudget, type Budget } from '../src/lib/ledger/budgets.ts'
import { TRANSFER_CATEGORY } from '../src/lib/ledger/categorize.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const spend = (date: string, amount: number, category: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `${date}-${amount}-${category}-${over.currency ?? 'EUR'}`,
  date,
  direction: 'out',
  amount,
  currency: 'EUR',
  account: 'Current',
  category,
  description: category,
  notes: '',
  tags: [],
  documentIds: [],
  source: 'manual',
  createdAt: '',
  ...over,
})

const budget = (category: string, monthly: number, currency = 'EUR'): Budget => ({ category, monthly, currency, createdAt: '' })

const span = { start: '2026-09-27', end: '2026-10-26' }

test('a budget is ok below the warning share, warns close to the limit, and is over above it', () => {
  const txs = [spend('2026-10-01', 100, 'Groceries'), spend('2026-10-02', 170, 'Dining'), spend('2026-10-03', 250, 'Shopping')]
  const rows = budgetProgress([budget('Groceries', 400), budget('Dining', 200), budget('Shopping', 200)], txs, span, 'EUR')
  const byCat = Object.fromEntries(rows.map((r) => [r.category, r]))
  assert.equal(byCat.Groceries.state, 'ok')
  assert.equal(byCat.Dining.state, 'warn')
  assert.equal(byCat.Shopping.state, 'over')
  assert.equal(BUDGET_WARN_AT, 0.8)
  assert.equal(byCat.Shopping.remaining, -50)
})

test('rows are sorted by how much of the budget is used', () => {
  const txs = [spend('2026-10-01', 50, 'Groceries'), spend('2026-10-01', 90, 'Dining')]
  const rows = budgetProgress([budget('Groceries', 100), budget('Dining', 100)], txs, span, 'EUR')
  assert.deepEqual(
    rows.map((r) => r.category),
    ['Dining', 'Groceries'],
  )
})

test('only spending in the period, the budget currency and not a transfer counts', () => {
  const txs = [
    spend('2026-09-26', 500, 'Groceries'), // before the cycle
    spend('2026-10-10', 30, 'Groceries'),
    spend('2026-10-11', 40, 'Groceries', { currency: 'USD' }), // other currency
    spend('2026-10-12', 60, TRANSFER_CATEGORY), // moving money is not spending
    { ...spend('2026-10-13', 999, 'Groceries'), direction: 'in' }, // money in is not spending
  ]
  const [row] = budgetProgress([budget('Groceries', 100)], txs, span, 'EUR')
  assert.equal(row.spent, 30)
  assert.equal(row.state, 'ok')
})

test('budgets in another currency are left out, and empty budgets are ignored', () => {
  const rows = budgetProgress([budget('Groceries', 100, 'USD'), budget('Dining', 0)], [], span, 'EUR')
  assert.deepEqual(rows, [])
})

test('a budget row round-trips through the Budgets tab format', () => {
  const row = budgetToRow({ category: 'Groceries', monthly: 400, currency: 'EUR', createdAt: '2026-10-01T00:00:00.000Z' })
  assert.deepEqual(row, ['Groceries', 400, 'EUR', '2026-10-01T00:00:00.000Z'])
  assert.deepEqual(rowToBudget(row, 2), { category: 'Groceries', monthly: 400, currency: 'EUR', createdAt: '2026-10-01T00:00:00.000Z', row: 2 })
})

test('a sheet row with a comma decimal and no currency still reads', () => {
  assert.deepEqual(rowToBudget(['Dining', '150,50', '', ''], 3), { category: 'Dining', monthly: 150.5, currency: 'EUR', createdAt: '', row: 3 })
  assert.equal(rowToBudget(['', 100, 'EUR', ''], 4), null)
})
