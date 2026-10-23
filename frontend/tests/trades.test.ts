import { test } from 'node:test'
import assert from 'node:assert/strict'
import { positionFrom, returnFrom, rowToTrade, tradeProblem, tradeToRow, TRADE_COLUMNS, xirr, type Trade } from '../src/lib/ledger/trades.ts'

let n = 0
const trade = (over: Partial<Trade> = {}): Trade => ({
  id: `t${++n}`, holdingId: 'h1', accountId: 'a1', date: '2025-01-02', type: 'buy', quantity: 10, price: 100, amount: 0, fee: 0, tax: 0, currency: 'EUR', notes: '', createdAt: `2025-01-02T00:00:${String(n % 60).padStart(2, '0')}Z`, ...over,
})

test('a trade survives a round trip through a sheet row; unreadable rows are skipped', () => {
  const t = trade({ fee: 1.5, tax: 0.3, notes: 'savings plan' })
  const row = tradeToRow(t)
  assert.equal(row.length, TRADE_COLUMNS.length)
  assert.deepEqual(rowToTrade(row, 7), { ...t, row: 7 })
  assert.equal(rowToTrade([], 2), null)
  assert.equal(rowToTrade(['x', 'h', 'a', 'someday', 'buy'], 2), null)
  assert.equal(rowToTrade(['x', 'h', 'a', '2025-02-03', 'swap', '-4'], 2)?.type, 'buy')
  assert.equal(rowToTrade(['x', 'h', 'a', '2025-02-03', 'swap', '-4'], 2)?.quantity, 4)
})

test('buys add to the average cost, fees included', () => {
  const p = positionFrom([trade({ quantity: 10, price: 100 }), trade({ date: '2025-03-01', quantity: 10, price: 120, fee: 10 })])
  assert.equal(p.quantity, 20)
  assert.equal(p.heldCost, 2210)
  assert.equal(p.avgCost, 110.5)
  assert.equal(p.realised, 0)
})

test('a sale takes cost out at the average and books the gain after its fee and tax', () => {
  const p = positionFrom([
    trade({ quantity: 10, price: 100 }),
    trade({ date: '2025-03-01', quantity: 10, price: 120 }),
    trade({ date: '2025-06-01', type: 'sell', quantity: 5, price: 150, fee: 2, tax: 3 }),
  ])
  assert.equal(p.quantity, 15)
  assert.equal(p.avgCost, 110)
  assert.equal(p.heldCost, 1650)
  assert.equal(p.realised, 5 * 150 - 5 - 5 * 110)
})

test('trades are taken in date order whatever order they are given in', () => {
  const a = positionFrom([trade({ date: '2025-06-01', type: 'sell', quantity: 5, price: 150 }), trade({ quantity: 10, price: 100 })])
  assert.equal(a.quantity, 5)
  assert.equal(a.realised, 250)
})

test('selling everything leaves nothing held; selling more than held is reported, not counted', () => {
  const all = positionFrom([trade(), trade({ date: '2025-05-01', type: 'sell', quantity: 10, price: 90 })])
  assert.equal(all.quantity, 0)
  assert.equal(all.avgCost, null)
  assert.equal(all.heldCost, 0)
  assert.equal(all.realised, -100)
  const over = positionFrom([trade({ quantity: 4 }), trade({ date: '2025-05-01', type: 'sell', quantity: 10, price: 110 })])
  assert.equal(over.quantity, 0)
  assert.equal(over.oversold, 6)
  assert.equal(over.realised, 40)
})

test('dividends are counted net of tax', () => {
  const p = positionFrom([trade(), trade({ date: '2025-04-01', type: 'dividend', quantity: 0, price: 0, amount: 20, tax: 5 })])
  assert.equal(p.dividends, 15)
  assert.equal(p.quantity, 10)
})

test('XIRR matches known cases', () => {
  // 1000 in, 1100 back exactly one year later: 10%
  const r = xirr([{ date: '2024-01-01', amount: -1000 }, { date: '2024-12-31', amount: 1100 }])!
  assert.ok(Math.abs(r - 0.1) < 0.002, String(r))
  // Money that comes back at a loss
  assert.ok(xirr([{ date: '2024-01-01', amount: -1000 }, { date: '2025-01-01', amount: 900 }])! < 0)
  // Needs money out and money in
  assert.equal(xirr([{ date: '2024-01-01', amount: -1000 }]), null)
  assert.equal(xirr([{ date: '2024-01-01', amount: 1000 }, { date: '2024-06-01', amount: 100 }]), null)
  // Two equal buys a year apart, worth 2310 after the second year: 10% a year
  const two = xirr([{ date: '2024-01-01', amount: -1000 }, { date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 2310 }])!
  assert.ok(Math.abs(two - 0.1) < 0.003, String(two))
})

test('the return of a holding from its trades and what it is worth', () => {
  const trades = [trade({ date: '2024-01-01', quantity: 10, price: 100 }), trade({ date: '2025-01-01', type: 'dividend', quantity: 0, price: 0, amount: 50 })]
  const r = returnFrom(trades, 1200, '2026-01-01')
  assert.equal(r.invested, 1000)
  assert.equal(r.received, 50)
  assert.equal(r.gain, 250)
  assert.equal(r.gainShare, 0.25)
  assert.equal(r.firstDate, '2024-01-01')
  assert.equal(r.tooShort, false)
  assert.ok(r.yearly! > 0.1 && r.yearly! < 0.14, String(r.yearly))
})

test('a yearly rate is not shown for a holding younger than 90 days, or without a price', () => {
  const young = returnFrom([trade({ date: '2026-01-01' })], 1100, '2026-02-01')
  assert.equal(young.tooShort, true)
  assert.equal(young.yearly, null)
  assert.equal(young.gain, 100)
  const unpriced = returnFrom([trade({ date: '2024-01-01' })], null, '2026-02-01')
  assert.equal(unpriced.gain, null)
  assert.equal(unpriced.yearly, null)
  assert.equal(returnFrom([], null, '2026-02-01').firstDate, null)
})

test('problems with a trade are named', () => {
  const ok = { holdingId: 'h1', date: '2026-01-01', type: 'buy' as const, quantity: 1, price: 1, amount: 0, fee: 0, tax: 0 }
  assert.equal(tradeProblem(ok, '2026-10-23'), null)
  assert.match(tradeProblem({ ...ok, holdingId: '' }, '2026-10-23') ?? '', /holding/)
  assert.match(tradeProblem({ ...ok, date: '' }, '2026-10-23') ?? '', /date/)
  assert.match(tradeProblem({ ...ok, date: '2027-01-01' }, '2026-10-23') ?? '', /future/)
  assert.match(tradeProblem({ ...ok, quantity: 0 }, '2026-10-23') ?? '', /units/)
  assert.match(tradeProblem({ ...ok, price: 0 }, '2026-10-23') ?? '', /price/)
  assert.match(tradeProblem({ ...ok, type: 'dividend', amount: 0 }, '2026-10-23') ?? '', /received/)
  assert.equal(tradeProblem({ ...ok, type: 'dividend', quantity: 0, price: 0, amount: 5 }, '2026-10-23'), null)
})
