import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combinedTotals, quoteToBase, toQuote, validRate } from '../src/lib/ledger/fx.ts'
import { rowsToProfile } from '../src/lib/ledger/profile.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const fx = { base: 'EUR', quote: 'INR', rate: 90 }
const tx = (id: string, direction: 'in' | 'out', amount: number, currency: string): Transaction => ({
  id, date: '2026-10-05', direction, amount, currency, account: '', category: direction === 'in' ? 'Salary' : 'Groceries',
  description: id, notes: '', tags: [], documentIds: [], source: 'manual', createdAt: '2026-10-05T10:00:00Z',
} as unknown as Transaction)

test('a rate is only valid with two different currencies and a positive number', () => {
  assert.ok(validRate(fx))
  assert.ok(!validRate({ ...fx, rate: 0 }))
  assert.ok(!validRate({ ...fx, quote: 'EUR' }))
  assert.ok(!validRate(null))
})

test('conversion goes both ways at the typed rate', () => {
  assert.equal(toQuote(10, fx), 900)
  assert.equal(quoteToBase(900, fx), 10)
})

test('combined totals add the second currency at the rate and leave other currencies out', () => {
  const all = [tx('a', 'in', 4200, 'EUR'), tx('b', 'in', 36000, 'INR'), tx('c', 'out', 900, 'INR'), tx('d', 'out', 50, 'EUR'), tx('e', 'out', 99, 'USD')]
  const t = combinedTotals(all, { start: '2026-10-01', end: '2026-10-31' }, fx)
  assert.equal(t.income, 4600)
  assert.equal(t.spending, 60)
  assert.equal(t.net, 4540)
})

test('the rate is read from the profile and a broken one is dropped', () => {
  const row = (value: string) => [{ key: 'exchangeRate' as const, value: JSON.parse(value), updatedAt: '', row: 2 }]
  assert.deepEqual(rowsToProfile(row('{"base":"eur","quote":"inr","rate":"90.5"}'))?.exchangeRate, { base: 'EUR', quote: 'INR', rate: 90.5 })
  assert.equal(rowsToProfile(row('{"base":"EUR","quote":"INR","rate":-1}'))?.exchangeRate, undefined)
})
