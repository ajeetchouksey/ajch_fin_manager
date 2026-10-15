import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANALYSIS_COLUMNS, analysisToRow, isStale, ledgerAsOf, rowToAnalysis, verifyFigures, type Analysis, type FigureClaim } from '../src/lib/ledger/analysis.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (date: string, amount: number, category: string, createdAt: string): Transaction => ({
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
  createdAt,
})

const ledger = [
  tx('2026-10-01', 3000, 'Salary', '2026-10-01T09:00:00Z'),
  tx('2026-10-05', -430, 'Groceries', '2026-10-05T09:00:00Z'),
  tx('2026-10-12', -250, 'Dining', '2026-10-12T09:00:00Z'),
]
const OCT = { start: '2026-10-01', end: '2026-10-31' }

const claim = (over: Partial<FigureClaim>): FigureClaim => ({ name: 'x', value: 0, metric: 'spending', period: OCT, currency: 'EUR', ...over })

test('figures that match the ledger verify as yes', () => {
  const r = verifyFigures([claim({ name: 'spent', value: 680 }), claim({ name: 'in', value: 3000, metric: 'income' })], ledger)
  assert.equal(r.verified, 'yes')
  assert.deepEqual(
    r.figures.map((f) => [f.name, f.actual, f.matches]),
    [
      ['spent', 680, true],
      ['in', 3000, true],
    ],
  )
})

test('a figure that differs from the ledger makes the entry no, and shows the actual', () => {
  const r = verifyFigures([claim({ name: 'spent', value: 1200 })], ledger)
  assert.equal(r.verified, 'no')
  assert.equal(r.figures[0].actual, 680)
  assert.equal(r.figures[0].matches, false)
})

test('category spending is checked per category', () => {
  assert.equal(verifyFigures([claim({ metric: 'category_spending', category: 'Groceries', value: 430 })], ledger).verified, 'yes')
  assert.equal(verifyFigures([claim({ metric: 'category_spending', category: 'Travel', value: 0 })], ledger).verified, 'yes', 'no spending is zero')
})

test('small rounding within a cent still matches, a bigger difference does not', () => {
  assert.equal(verifyFigures([claim({ value: 680.005 })], ledger).verified, 'yes')
  assert.equal(verifyFigures([claim({ value: 680.5 })], ledger).verified, 'no')
})

test('unsupported figures are not checked, and an entry with unchecked figures is not_checked', () => {
  const r = verifyFigures([claim({ value: 680 }), claim({ metric: 'category_spending', category: undefined, value: 5 })], ledger)
  assert.equal(r.verified, 'not_checked')
  assert.equal(r.figures[1].actual, null)
  assert.equal(verifyFigures([], ledger).verified, 'not_checked')
})

test('an entry is stale only when the ledger has newer transactions than it was written from', () => {
  const asOf = ledgerAsOf(ledger)
  assert.equal(asOf, '2026-10-12T09:00:00Z')
  assert.equal(isStale({ ledgerAsOf: asOf }, ledger), false)
  const later = [...ledger, tx('2026-10-14', -20, 'Groceries', '2026-10-14T08:00:00Z')]
  assert.equal(isStale({ ledgerAsOf: asOf }, later), true)
})

test('an entry round-trips through the Analysis tab format', () => {
  const entry: Analysis = {
    id: 'an_1',
    kind: 'recommendation',
    title: 'Trim dining',
    body: 'Dining went up.',
    periodStart: OCT.start,
    periodEnd: OCT.end,
    figures: verifyFigures([claim({ value: 680 })], ledger).figures,
    verified: 'yes',
    status: 'open',
    writtenBy: 'Claude',
    createdAt: '2026-10-15T10:00:00Z',
    ledgerAsOf: '2026-10-12T09:00:00Z',
  }
  const row = analysisToRow(entry)
  assert.equal(row.length, ANALYSIS_COLUMNS.length)
  const back = rowToAnalysis(row, 2)!
  assert.equal(back.kind, 'recommendation')
  assert.equal(back.verified, 'yes')
  assert.equal(back.figures[0].value, 680)
  assert.equal(back.row, 2)
})

test('unknown kinds and statuses fall back to safe values, and broken figure data is dropped', () => {
  const row = ['an_2', 'something-else', 'T', 'B', '', '', 'not json', 'maybe', 'archived', '', '', '']
  const back = rowToAnalysis(row, 5)!
  assert.equal(back.kind, 'analysis')
  assert.equal(back.status, 'open')
  assert.equal(back.verified, 'not_checked')
  assert.deepEqual(back.figures, [])
  assert.equal(back.writtenBy, 'unknown')
  assert.equal(rowToAnalysis(['', 'analysis'], 3), null)
})
