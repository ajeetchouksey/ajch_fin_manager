import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deductionSuggestions, taxYearSummary, tagsWithConfirmation } from '../src/lib/tax/summary.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (date: string, amount: number, category: string, direction: 'in' | 'out', over: Partial<Transaction> = {}): Transaction => ({
  id: `${date}-${amount}-${category}-${direction}`,
  date,
  direction,
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

const ledger = [
  tx('2025-01-31', 4000, 'Salary', 'in'),
  tx('2025-02-28', 4000, 'Salary', 'in'),
  tx('2025-03-15', 300, 'Interest & dividends', 'in'),
  tx('2025-04-01', 150, 'Refund', 'in'), // not income in this sense
  tx('2025-05-10', 500, 'Transfer', 'in'), // a move between own accounts is never income
  tx('2025-06-01', 2000, 'Salary', 'in', { currency: 'USD' }), // other currency
  tx('2026-01-05', 4100, 'Salary', 'in'), // next year
  tx('2025-03-02', 1200, 'Education', 'out'),
  tx('2025-07-14', 90, 'Gifts & donations', 'out'),
  tx('2025-08-01', 60, 'Groceries', 'out'),
  tx('2025-09-09', 40, 'Education', 'out', { tags: ['tax:de:werbungskosten'] }),
  tx('2025-10-02', 75, 'Other income', 'in'), // money in that is not clearly income: flagged for a check
]

test('taxable income sums only income categories in the year and currency, largest category first', () => {
  const s = taxYearSummary(ledger, 'DE', 2025, 'EUR')
  assert.equal(s.taxableIncome, 8300)
  assert.deepEqual(
    s.incomeByCategory.map((c) => [c.category, c.amount]),
    [
      ['Salary', 8000],
      ['Interest & dividends', 300],
    ],
  )
  assert.deepEqual(s.incomeTransactionIds.length, 3)
})

test('refunds and transfers are not counted as taxable income, but unclassified money in is flagged for a check', () => {
  const s = taxYearSummary(ledger, 'DE', 2025, 'EUR')
  assert.equal(s.unclassifiedIn, 1, 'the transfer is excluded; the refund is excluded by design')
})

test('deduction suggestions cover only the year, country hints and money out, and mark already tagged rows', () => {
  const de = deductionSuggestions(ledger, 'DE', 2025, 'EUR')
  assert.deepEqual(
    de.map((d) => [d.description, d.tag, d.alreadyTagged]),
    [
      ['Education', 'tax:de:werbungskosten', false],
      ['Gifts & donations', 'tax:de:spenden', false],
      ['Education', 'tax:de:werbungskosten', true],
    ],
  )
  assert.ok(!de.some((d) => d.description === 'Groceries'), 'groceries are not suggested')
})

test('India uses its own tags, and a country with no hints gets none', () => {
  const india = deductionSuggestions(ledger, 'IN', 2025, 'EUR')
  assert.ok(india.every((d) => d.tag.startsWith('tax:in:')))
  // India's year is April to March: the March 2025 payment belongs to FY 2024-25, so it is left out
  assert.deepEqual(india.map((d) => d.description), ['Gifts & donations', 'Education'])
})

test('a confirmed tag is added once and never removes other tags', () => {
  assert.deepEqual(tagsWithConfirmation(['monthly'], 'tax:de:spenden'), ['monthly', 'tax:de:spenden'])
  assert.deepEqual(tagsWithConfirmation(['tax:de:spenden'], 'tax:de:spenden'), ['tax:de:spenden'])
})
