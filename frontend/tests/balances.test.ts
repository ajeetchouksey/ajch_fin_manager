import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountBalances } from '../src/lib/ledger/balances.ts'
import type { Account } from '../src/lib/ledger/portfolio.ts'

const acc = (id: string, name: string, type: string, balance: number, currency = 'EUR'): Account =>
  ({ id, name, type, institution: 'Sparkasse', currency, balance, asOf: '2026-10-19', rate: null, monthly: 0, notes: '', createdAt: '' }) as Account

test('assets add up, debts are subtracted, and net worth is the difference', () => {
  const b = accountBalances(
    [acc('1', 'Current', 'current', 1200), acc('2', 'Savings', 'savings', 8000), acc('3', 'Car loan', 'loan', 3000)],
    'EUR',
  )
  assert.equal(b.assets, 9200)
  assert.equal(b.debts, 3000)
  assert.equal(b.net, 6200)
})

test('insurance is listed but not counted in net worth', () => {
  const b = accountBalances([acc('1', 'Current', 'current', 500), acc('2', 'Life cover', 'ins_life', 100000)], 'EUR')
  const cover = b.rows.find((r) => r.id === '2')!
  assert.equal(cover.counted, false)
  assert.equal(b.assets, 500)
  assert.equal(b.net, 500)
})

test('only accounts in the chosen currency are included, and currencies are never converted', () => {
  const b = accountBalances([acc('1', 'Current', 'current', 500, 'EUR'), acc('2', 'USD card', 'current', 900, 'USD')], 'EUR')
  assert.deepEqual(b.rows.map((r) => r.id), ['1'])
  assert.equal(b.net, 500)
})

test('rows are grouped cash first, then by balance, with debts after assets', () => {
  const b = accountBalances(
    [acc('d', 'Card', 'credit_card', 400), acc('s', 'Savings', 'savings', 100), acc('c', 'Current', 'current', 900)],
    'EUR',
  )
  assert.deepEqual(b.rows.map((r) => r.id), ['c', 's', 'd'])
  assert.equal(b.rows[2].groupLabel, 'Debts')
})

test('no accounts gives zero totals', () => {
  assert.deepEqual(accountBalances([], 'EUR'), { rows: [], assets: 0, debts: 0, net: 0 })
})
