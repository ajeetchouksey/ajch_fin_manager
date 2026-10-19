import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareRegimes, estimateIN } from '../src/lib/tax/india.ts'
import { TaxYearNotCovered } from '../src/lib/tax/types.ts'

// Expected values worked out by hand from the Income Tax Department's tables for AY 2026-27 (FY 2025-26),
// checked 2026-10-16: https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1
const Y = '2025-26'

test('new regime, 13 lakh: 60,000 + 15% above 12 lakh = 75,000, plus 4% cess = 78,000', () => {
  const r = estimateIN({ year: Y, regime: 'new', otherIncome: 1300000 })
  assert.equal(r.total, 78000)
})

test('new regime, resident at 12 lakh pays nothing after the 87A rebate', () => {
  assert.equal(estimateIN({ year: Y, regime: 'new', otherIncome: 1200000 }).total, 0)
})

test('a non-resident gets no 87A rebate', () => {
  // 60,000 slab tax + 2,400 cess
  assert.equal(estimateIN({ year: Y, regime: 'new', otherIncome: 1200000, resident: false }).total, 62400)
})

test('old regime, 10 lakh: 1,12,500 plus cess = 1,17,000; resident at 5 lakh pays nothing', () => {
  assert.equal(estimateIN({ year: Y, regime: 'old', otherIncome: 1000000 }).total, 117000)
  assert.equal(estimateIN({ year: Y, regime: 'old', otherIncome: 500000 }).total, 0)
})

test('surcharge: 10% above 50 lakh, then cess on tax plus surcharge', () => {
  // New regime, 60 lakh: 3,00,000 + 30% above 24 lakh = 13,80,000; surcharge 1,38,000; cess 60,720
  assert.equal(estimateIN({ year: Y, regime: 'new', otherIncome: 6000000 }).total, 1578720)
})

test('the new regime caps surcharge at 25%; the old regime goes to 37% above 5 crore', () => {
  const income = 60000000
  const newer = estimateIN({ year: Y, regime: 'new', otherIncome: income })
  const older = estimateIN({ year: Y, regime: 'old', otherIncome: income })
  const surcharge = (r: typeof newer) => r.lines.find((l) => l.label === 'Surcharge')!.amount
  const slab = (r: typeof newer) => r.lines[0].amount
  assert.equal(Math.round(surcharge(newer) / slab(newer) * 100), 25)
  assert.equal(Math.round(surcharge(older) / slab(older) * 100), 37)
})

test('salary gets the standard deduction, and the estimate says it must be confirmed', () => {
  // 12,75,000 salary minus 75,000 = 12,00,000 taxable, rebate brings tax to zero
  const r = estimateIN({ year: Y, regime: 'new', salary: 1275000 })
  assert.equal(r.total, 0)
  assert.ok(r.assumptions.some((a) => /confirm it with your Form 16/.test(a)))
  // A supplied figure is used as given
  const given = estimateIN({ year: Y, regime: 'new', salary: 1275000, standardDeduction: 50000 })
  assert.ok(given.total > 0)
})

test('old-regime deductions reduce taxable income only under the old regime', () => {
  const newer = estimateIN({ year: Y, regime: 'new', otherIncome: 1000000, oldRegimeDeductions: 200000 })
  const older = estimateIN({ year: Y, regime: 'old', otherIncome: 1000000, oldRegimeDeductions: 200000 })
  assert.equal(newer.total, estimateIN({ year: Y, regime: 'new', otherIncome: 1000000 }).total)
  // Old: 8 lakh taxable -> 12,500 + 20% of 3 lakh = 72,500, plus cess = 75,400
  assert.equal(older.total, 75400)
})

test('compareRegimes picks the lower one', () => {
  const c = compareRegimes({ year: Y, otherIncome: 1000000 })
  assert.equal(c.lower, 'new')
  assert.equal(c.difference, c.old.total - c.new.total)
})

test('a financial year without encoded rules is refused', () => {
  assert.throws(() => estimateIN({ year: '2026-27', regime: 'new', otherIncome: 1000000 }), TaxYearNotCovered)
})
