import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MASK, maskAmount, privately, setAmountsHidden } from '../src/lib/ledger/privacy.ts'
import { formatMoney } from '../src/lib/ledger/types.ts'

test('masking keeps the symbol, sign and suffix and drops every digit', () => {
  assert.equal(maskAmount('€1,234.56'), `€${MASK}`)
  assert.equal(maskAmount('1.234,56 €'), `${MASK} €`)
  assert.equal(maskAmount('+₹12,34,567.00'), `+₹${MASK}`)
  assert.equal(maskAmount('€1.2K'), `€${MASK}.${MASK}K`.replace(`.${MASK}`, ''))
  assert.equal(maskAmount('No numbers'), 'No numbers')
})

test('amounts are masked only while hidden', () => {
  setAmountsHidden(false)
  assert.match(formatMoney(1234.5, 'EUR'), /1/)
  setAmountsHidden(true)
  assert.ok(!/\d/.test(formatMoney(1234.5, 'EUR')))
  assert.ok(formatMoney(10, 'EUR', 'in').startsWith('+'))
  assert.equal(privately('42'), MASK)
  setAmountsHidden(false)
  assert.equal(privately('42'), '42')
})
