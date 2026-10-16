import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateDE, incomeTax, soli } from '../src/lib/tax/de.ts'
import { TaxYearNotCovered } from '../src/lib/tax/types.ts'

// Reference values from the separate Python implementation of § 32a EStG kept on the archive branch
// (fincore/tax_de.py), with the 2025 and 2026 parameters checked against the law text on 2026-10-16.
// Format: [year, taxable income, single tax, joint tax]
const REFERENCE: Array<[number, number, number, number]> = [
  [2025, 0, 0, 0],
  [2025, 12096, 0, 0],
  [2025, 12348, 35, 0],
  [2025, 15000, 485, 0],
  [2025, 17443, 1015, 0],
  [2025, 30000, 4303, 970],
  [2025, 50000, 10691, 5854],
  [2025, 68480, 17849, 11078],
  [2025, 100000, 31088, 21382],
  [2025, 277825, 105774, 94862],
  [2025, 300000, 115753, 104176],
  [2026, 12348, 0, 0],
  [2026, 15000, 435, 0],
  [2026, 17799, 1034, 0],
  [2026, 30000, 4217, 870],
  [2026, 50000, 10548, 5700],
  [2026, 69878, 18213, 11302],
  [2026, 100000, 30864, 21096],
  [2026, 277825, 105550, 94414],
  [2026, 300000, 115529, 103728],
]

test('income tax matches the reference implementation for 2025 and 2026, single and joint', () => {
  for (const [year, income, single, joint] of REFERENCE) {
    assert.equal(incomeTax(income, year), single, `${year} single ${income}`)
    assert.equal(incomeTax(income, year, true), joint, `${year} joint ${income}`)
  }
})

test('a hand-checked 2026 value: 50,000 EUR taxable income gives 10,548 EUR', () => {
  // z = (50000 - 17799) / 10000 = 3.2201; (173.10 z + 2397) z + 1034.87 = 10548.33, rounded down
  assert.equal(incomeTax(50000, 2026), 10548)
})

test('no tax up to the basic allowance, and tax rises with income', () => {
  assert.equal(incomeTax(12348, 2026), 0)
  let prev = 0
  for (let x = 12000; x <= 300000; x += 7919) {
    const t = incomeTax(x, 2026)
    assert.ok(t >= prev, `tax falls at ${x}`)
    prev = t
  }
})

test('Soli: nothing up to the Freigrenze, phased in at 11.9%, then 5.5%', () => {
  assert.equal(soli(20350, 2026), 0)
  assert.equal(soli(21000, 2026), 77.35)
  assert.equal(soli(40000, 2026), 2200)
  assert.equal(soli(40000, 2026, true), 0, 'joint Freigrenze is doubled')
  assert.equal(soli(19950, 2025), 0)
  assert.equal(soli(25000, 2025), 600.95)
})

test('the estimate adds church tax only when asked, and labels itself as an estimate', () => {
  const plain = estimateDE({ year: 2026, taxableIncome: 50000 })
  assert.equal(plain.estimate, true)
  assert.equal(plain.total, 10548)
  assert.equal(plain.lines.length, 2)
  const church = estimateDE({ year: 2026, taxableIncome: 50000, churchRate: 0.09 })
  assert.equal(church.total, Math.round((10548 + 949.32) * 100) / 100)
  assert.ok(church.notCovered.length > 0 && church.sources.length > 0)
  assert.ok(church.assumptions.some((a) => /not tax advice/.test(a)))
})

test('the marginal rate is the tax on the next 100 EUR', () => {
  assert.equal(estimateDE({ year: 2026, taxableIncome: 100000 }).marginalRate, 0.42)
})

test('a year without encoded rules is refused, never guessed', () => {
  assert.throws(() => incomeTax(50000, 2024), TaxYearNotCovered)
  assert.throws(() => estimateDE({ year: 2027, taxableIncome: 50000 }), /not covered yet/)
})
