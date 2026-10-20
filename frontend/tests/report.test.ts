import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReport, choosePeriod, reportToHtml } from '../src/lib/ledger/report.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (date: string, amount: number, category: string, description = category): Transaction => ({
  id: `${date}-${amount}-${category}-${description}`,
  date,
  direction: amount >= 0 ? 'in' : 'out',
  amount: Math.abs(amount),
  currency: 'EUR',
  account: 'Current',
  category,
  description,
  notes: '',
  tags: [],
  documentIds: [],
  source: 'manual',
  createdAt: '',
})

const SEP = { start: '2026-09-01', end: '2026-09-30' }
const OCT = { start: '2026-10-01', end: '2026-10-31' }

// September: 3000 in, groceries 400 (REWE), dining 100
// October: 3000 in, groceries 430 (REWE), dining 300 (new payee Bistro Roma 250 + 50 Cafe)
const data = [
  tx('2026-09-01', 3000, 'Salary', 'ACME'),
  tx('2026-09-05', -400, 'Groceries', 'REWE'),
  tx('2026-09-12', -100, 'Dining', 'Cafe Mitte'),
  tx('2026-10-01', 3000, 'Salary', 'ACME'),
  tx('2026-10-05', -430, 'Groceries', 'REWE'),
  tx('2026-10-12', -250, 'Dining', 'Bistro Roma'),
  tx('2026-10-20', -50, 'Dining', 'Cafe Mitte'),
]

const report = (over: Partial<Parameters<typeof buildReport>[0]> = {}) =>
  buildReport({
    transactions: data,
    budgets: [],
    currency: 'EUR',
    span: OCT,
    label: 'October 2026',
    previous: { span: SEP, label: 'September 2026' },
    ...over,
  })

test('figures: money in, money out, left over and savings rate for the period', () => {
  const r = report()
  const [inLine, outLine, leftLine, rateLine] = r.metrics
  assert.equal(inLine.current, 3000)
  assert.equal(outLine.current, 730)
  assert.equal(outLine.previous, 500)
  assert.equal(leftLine.current, 2270)
  assert.equal(rateLine.current, 75.67)
  assert.equal(rateLine.previous, 83.33)
})

test('categories are flagged only when they move beyond the threshold and the minimum amount', () => {
  const r = report()
  const groceries = r.categories.find((c) => c.label === 'Groceries')!
  const dining = r.categories.find((c) => c.label === 'Dining')!
  assert.equal(groceries.flag, false, 'a 7.5% move is below the 20% threshold')
  assert.equal(dining.flag, true, 'dining rose from 100 to 300')
  assert.equal(dining.change, 2)
  assert.deepEqual(
    r.watchList.map((c) => c.label),
    ['Dining'],
  )
})

test('a move is explained by new payees when the data shows it', () => {
  const dining = report().categories.find((c) => c.label === 'Dining')!
  assert.match(dining.note, /mostly new payees: Bistro Roma/)
})

test('a single payment equal to the move is called out as possible timing', () => {
  const txs = [
    tx('2026-09-01', 3000, 'Salary', 'ACME'),
    tx('2026-09-10', -100, 'Gifts', 'Florist'),
    tx('2026-10-01', 3000, 'Salary', 'ACME'),
    tx('2026-10-03', -600, 'Gifts', 'Car repair garage'), // one payment, the same size as the move
    tx('2026-10-04', -100, 'Gifts', 'Florist'),
  ]
  const r = report({ transactions: txs })
  const gifts = r.categories.find((c) => c.label === 'Gifts')!
  assert.match(gifts.note, /one new payment of 600,00\s€ to Car repair garage.*timing/)
})

test('a move the data does not explain is labelled driver to be confirmed', () => {
  // Same payees and the same number of payments, only the amounts differ
  const txs = [
    tx('2026-09-01', 3000, 'Salary', 'ACME'),
    tx('2026-09-05', -100, 'Shopping', 'Store A'),
    tx('2026-10-01', 3000, 'Salary', 'ACME'),
    tx('2026-10-05', -300, 'Shopping', 'Store A'),
  ]
  const r = report({ transactions: txs })
  assert.equal(r.categories.find((c) => c.label === 'Shopping')!.note, 'driver to be confirmed')
})

test('headline has the period facts, the change, and budget status in at most three sentences', () => {
  const r = report({ budgets: [{ category: 'Dining', monthly: 200, currency: 'EUR', createdAt: '' }] })
  assert.equal(r.headline.length, 3)
  assert.match(r.headline[0], /In October 2026 you received 3\.000,00\s€ and spent 730,00\s€/)
  assert.match(r.headline[1], /Spending was up 230,00\s€/)
  assert.match(r.headline[2], /1 budget over/)
})

test('no previous period: no comparison, and nothing is flagged', () => {
  const r = report({ previous: null })
  assert.equal(r.previousLabel, null)
  assert.equal(r.watchList.length, 0)
  assert.equal(r.headline.length, 1)
})

test('the HTML for the Google Doc escapes text and keeps the driver wording', () => {
  const txs = [tx('2026-09-01', 3000, 'Salary', 'ACME'), tx('2026-10-05', -300, 'Shopping', 'A & B <shop>')]
  const html = reportToHtml(report({ transactions: txs }), 'October review')
  assert.match(html, /A &amp; B &lt;shop&gt;/)
  assert.doesNotMatch(html, /<shop>/)
  assert.match(html, /<title>October review<\/title>/)
  assert.match(html, /Savings rate \(percent of money in\)<\/td><td style="text-align:right">\d+%/)
})

test('choosePeriod picks the latest period with data, or the one containing a date', () => {
  const latest = choosePeriod(data, 'calendar', '2026-10-14')
  assert.equal(latest.chosen?.start, '2026-10-01')
  assert.equal(latest.previous?.start, '2026-09-01')
  const picked = choosePeriod(data, 'calendar', '2026-10-14', '2026-09-15')
  assert.equal(picked.chosen?.start, '2026-09-01')
  assert.equal(picked.previous, null)
})
