import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOLDING_COLUMNS, holdingCost, holdingGain, holdingProblem, holdingsByAccount, holdingToRow, holdingValue, isIsin, rowToHolding, type Holding } from '../src/lib/ledger/holdings.ts'

const h = (over: Partial<Holding> = {}): Holding => ({
  id: 'hold-1', accountId: 'a1', name: 'World ETF', isin: 'IE00B4L5Y983', symbol: 'IWDA', assetClass: 'funds', quantity: 12.5, avgCost: 80, currency: 'EUR', price: 100, priceDate: '2026-10-20', notes: '', createdAt: '2026-10-01T00:00:00Z', ...over,
})

test('ISINs are checked including the check digit', () => {
  assert.equal(isIsin('IE00B4L5Y983'), true)
  assert.equal(isIsin('ie00b4l5y983'), true)
  assert.equal(isIsin('US0378331005'), true)
  assert.equal(isIsin('IE00B4L5Y984'), false)
  assert.equal(isIsin('IE00B4L5Y98'), false)
  assert.equal(isIsin(''), false)
})

test('a holding survives a round trip through a sheet row', () => {
  const x = h()
  const row = holdingToRow(x)
  assert.equal(row.length, HOLDING_COLUMNS.length)
  assert.deepEqual(rowToHolding(row, 4), { ...x, row: 4 })
  const bare = h({ avgCost: null, price: null, priceDate: '', isin: '' })
  assert.deepEqual(rowToHolding(holdingToRow(bare), 5), { ...bare, row: 5 })
})

test('rows that cannot be read are skipped or repaired', () => {
  assert.equal(rowToHolding([], 2), null)
  const odd = rowToHolding(['x', 'a1', '', 'ie00b4l5y983', '', 'bonds', '-3', 'abc', '', '-1', 'tomorrow', '', ''], 2)!
  assert.equal(odd.name, 'Holding')
  assert.equal(odd.isin, 'IE00B4L5Y983')
  assert.equal(odd.assetClass, 'other')
  assert.equal(odd.quantity, 3)
  assert.equal(odd.avgCost, null)
  assert.equal(odd.price, null)
  assert.equal(odd.priceDate, '')
  assert.equal(odd.currency, 'EUR')
})

test('value, cost and gain need the figures they depend on', () => {
  assert.equal(holdingValue(h()), 1250)
  assert.equal(holdingCost(h()), 1000)
  assert.deepEqual(holdingGain(h()), { amount: 250, share: 0.25 })
  assert.equal(holdingValue(h({ price: null })), null)
  assert.equal(holdingGain(h({ price: null })), null)
  assert.equal(holdingGain(h({ avgCost: null })), null)
  assert.equal(holdingGain(h({ avgCost: 0 })), null)
})

test('holdings add up per account; other currencies and unpriced ones are counted but not summed', () => {
  const list = [h(), h({ id: 'b', quantity: 10, price: 50 }), h({ id: 'c', price: null }), h({ id: 'd', currency: 'USD' }), h({ id: 'e', accountId: 'a2' })]
  const by = holdingsByAccount(list, () => 'EUR')
  assert.deepEqual(by.get('a1'), { accountId: 'a1', value: 1750, unpriced: 2, count: 4 })
  assert.equal(by.get('a2')?.value, 1250)
})

test('problems with a holding are named', () => {
  const ok = { accountId: 'a1', name: 'x', isin: '', quantity: 1, avgCost: null, price: null }
  assert.equal(holdingProblem(ok), null)
  // Units come from the trades once there are some, so a fully sold holding (0 units) can still be edited
  assert.match(holdingProblem({ ...ok, quantity: 0 }) ?? '', /units/)
  assert.equal(holdingProblem({ ...ok, quantity: 0 }, true), null)
  assert.match(holdingProblem({ ...ok, quantity: -1 }, true) ?? '', /units/)
  assert.match(holdingProblem({ ...ok, accountId: '' }) ?? '', /account/)
  assert.match(holdingProblem({ ...ok, name: ' ' }) ?? '', /name/)
  assert.match(holdingProblem({ ...ok, isin: 'IE00B4L5Y984' }) ?? '', /ISIN/)
  assert.match(holdingProblem({ ...ok, quantity: 0 }) ?? '', /units/)
  assert.match(holdingProblem({ ...ok, price: -1 }) ?? '', /price/)
})
