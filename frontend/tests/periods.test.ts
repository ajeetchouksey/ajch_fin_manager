import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  buildPeriods,
  calendarPeriod,
  daysBetween,
  median,
  periodContaining,
  predictNextSalary,
  salaryCreditDates,
  salaryPeriods,
} from '../src/lib/ledger/periods.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `${date}-${amount}`,
  date,
  direction: amount >= 0 ? 'in' : 'out',
  amount: Math.abs(amount),
  currency: 'EUR',
  account: '',
  category: amount >= 0 ? 'Salary' : 'Groceries',
  description: amount >= 0 ? 'ACME GMBH Gehalt' : 'REWE',
  notes: '',
  tags: [],
  documentIds: [],
  source: 'manual',
  createdAt: '',
  ...over,
})

test('calendar period covers the whole month, leap years included', () => {
  assert.deepEqual(calendarPeriod('2026-02-14'), { start: '2026-02-01', end: '2026-02-28', kind: 'calendar' })
  assert.deepEqual(calendarPeriod('2028-02-01'), { start: '2028-02-01', end: '2028-02-29', kind: 'calendar' })
  assert.equal(calendarPeriod('2026-12-31').end, '2026-12-31')
})

test('date arithmetic is exact across month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(daysBetween('2026-01-27', '2026-02-26'), 30)
})

test('median handles odd, even and empty lists', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([]), 0)
})

test('salary credits are money in, categorised Salary, and ignore small top-ups', () => {
  const txs = [
    tx('2026-01-27', 4200),
    tx('2026-02-26', 4200),
    tx('2026-03-27', 4200),
    tx('2026-03-10', 150, { category: 'Salary', description: 'Bonus top-up' }), // below half the median
    tx('2026-03-11', 90, { category: 'Other income' }), // wrong category
    tx('2026-03-12', -60, { category: 'Salary' }), // money out is never salary
  ]
  assert.deepEqual(salaryCreditDates(txs), ['2026-01-27', '2026-02-26', '2026-03-27'])
  assert.deepEqual(salaryCreditDates(txs, 'nobody'), [])
})

test('next salary follows the median gap and moves weekend paydays to Monday', () => {
  assert.equal(predictNextSalary(['2026-01-27']), null)
  // Find a start whose raw prediction lands on a Saturday, then check it moves to the Monday after
  // Two credits 30 days apart: the raw prediction is the last date plus 30
  let checked = false
  for (let d = 1; d <= 28 && !checked; d++) {
    const last = `2026-02-${String(d).padStart(2, '0')}`
    const raw = addDays(last, 30)
    if (new Date(`${raw}T00:00:00Z`).getUTCDay() === 6) {
      assert.equal(predictNextSalary([addDays(last, -30), last]), addDays(raw, 2))
      checked = true
    }
  }
  assert.ok(checked, 'expected a Saturday case in the sample range')
})

test('salary cycles run from one credit to the day before the next, with a partial start and an open end', () => {
  const dates = ['2026-01-27', '2026-02-26', '2026-03-27']
  const periods = salaryPeriods(dates, '2026-03-30', '2026-01-05')
  assert.deepEqual(periods[0], { start: '2026-01-05', end: '2026-01-26', kind: 'salary', partial: true })
  assert.deepEqual(periods[1], { start: '2026-01-27', end: '2026-02-25', kind: 'salary' })
  assert.deepEqual(periods[2], { start: '2026-02-26', end: '2026-03-26', kind: 'salary' })
  const open = periods[3]
  assert.equal(open.start, '2026-03-27')
  assert.equal(open.end, '2026-03-30')
  assert.equal(open.open, true)
  assert.ok(open.expectedEnd && open.expectedEnd >= open.end, 'expected end is never before the data end')
})

test('an open cycle with no prediction ends at its last data day', () => {
  const periods = salaryPeriods(['2026-03-27'], '2026-03-30')
  assert.deepEqual(periods, [{ start: '2026-03-27', end: '2026-03-30', kind: 'salary', open: true, expectedEnd: '2026-03-30' }])
})

test('buildPeriods lists every calendar month from the first transaction', () => {
  const txs = [tx('2026-01-15', -20), tx('2026-03-02', -5)]
  const months = buildPeriods('calendar', txs, '2026-03-20')
  assert.deepEqual(
    months.map((p) => p.start),
    ['2026-01-01', '2026-02-01', '2026-03-01'],
  )
})

test('buildPeriods in salary mode uses the salary history', () => {
  const txs = [tx('2026-01-05', -20), tx('2026-01-27', 4200), tx('2026-02-26', 4200), tx('2026-02-27', -80)]
  const cycles = buildPeriods('salary', txs, '2026-02-28')
  assert.equal(cycles[0].partial, true)
  assert.equal(cycles[1].start, '2026-01-27')
  assert.equal(cycles.at(-1)?.start, '2026-02-26')
  assert.equal(cycles.at(-1)?.open, true)
})

test('periodContaining finds the period for a date and null outside all periods', () => {
  const months = buildPeriods('calendar', [tx('2026-01-15', -20)], '2026-02-10')
  assert.equal(periodContaining('2026-02-01', months)?.start, '2026-02-01')
  assert.equal(periodContaining('2025-12-31', months), null)
})
