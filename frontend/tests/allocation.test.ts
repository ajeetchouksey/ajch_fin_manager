import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allocationFor, assetClassOf, cleanTarget, driftNotes, putInVersusWorth, targetProblem } from '../src/lib/ledger/allocation.ts'
import type { Holding } from '../src/lib/ledger/holdings.ts'
import { cleanInvestorProfile } from '../src/lib/ledger/investor.ts'
import type { Account, BalanceEntry } from '../src/lib/ledger/portfolio.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const TODAY = '2026-10-23'
const acc = (over: Partial<Account> = {}): Account => ({ id: 'a1', name: 'Depot', type: 'brokerage', institution: '', currency: 'EUR', balance: 10000, asOf: '2026-10-01', rate: null, monthly: 0, notes: '', createdAt: '', ...over })
const bal = (accountId: string, date: string, balance: number): BalanceEntry => ({ accountId, date, balance, recordedAt: '' })
let n = 0
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, date: '2026-06-15', direction: 'in', amount: 100, currency: 'EUR', account: 'Depot', accountId: 'a1', category: 'Transfer', description: 'Savings plan', notes: '', tags: [], source: 'manual', createdAt: '', ...over,
} as Transaction)

test('accounts count as a kind of holding from their type; cash is not one', () => {
  assert.equal(assetClassOf('brokerage'), 'funds')
  assert.equal(assetClassOf('mutual_fund'), 'funds')
  assert.equal(assetClassOf('shares'), 'shares')
  assert.equal(assetClassOf('gold'), 'gold')
  assert.equal(assetClassOf('crypto'), 'crypto')
  assert.equal(assetClassOf('pension'), 'retirement')
  assert.equal(assetClassOf('savings'), null)
  assert.equal(assetClassOf('mortgage'), null)
})

test('put in is the first balance plus payments since; the change is what is left over', () => {
  const history = [bal('a1', '2026-01-01', 8000), bal('a1', '2026-10-20', 10000)]
  const transactions = [tx({ date: '2026-03-01', amount: 500 }), tx({ date: '2026-05-01', amount: 500 }), tx({ date: '2026-07-01', amount: 200, direction: 'out' }), tx({ date: '2025-12-01', amount: 999 })]
  const [r] = putInVersusWorth([acc()], history, transactions, TODAY)
  assert.equal(r.putIn, 8000 + 500 + 500 - 200)
  assert.equal(r.worth, 10000)
  assert.equal(r.change, 10000 - 8800)
  assert.equal(r.changeShare, 0.1364)
  assert.equal(r.since, '2026-01-01')
  assert.equal(r.enough, true)
})

test('with one recorded balance the change is not told, and only investment accounts are listed', () => {
  const rows = putInVersusWorth([acc(), acc({ id: 'a2', type: 'savings' })], [bal('a1', '2026-10-01', 10000)], [], TODAY)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].enough, false)
  assert.equal(rows[0].change, 0)
})

test('targets keep only known kinds and whole percentages, and must add up to 100', () => {
  assert.deepEqual(cleanTarget({ funds: 60.4, shares: 40, bogus: 5, gold: 'x', crypto: -3, retirement: 101 }), { funds: 60, shares: 40 })
  assert.equal(cleanTarget({}), undefined)
  assert.equal(cleanTarget(null), undefined)
  assert.equal(targetProblem({ funds: 60, shares: 40 }), null)
  assert.match(targetProblem({ funds: 60, shares: 30 }) ?? '', /90%/)
})

test('allocation shares, drift and flags against a target; accounts in another currency are left out', () => {
  const accounts = [acc({ balance: 7000 }), acc({ id: 'a2', type: 'shares', balance: 2000 }), acc({ id: 'a3', type: 'pension', balance: 1000 }), acc({ id: 'a4', type: 'crypto', currency: 'INR', balance: 5 })]
  const a = allocationFor(accounts, [], [], 'EUR', TODAY, { funds: 60, shares: 20, retirement: 20 })
  assert.equal(a.total, 10000)
  assert.deepEqual(a.lines.map((l) => l.id), ['funds', 'shares', 'retirement'])
  const funds = a.lines[0]
  assert.equal(funds.share, 0.7)
  assert.equal(funds.drift, 10)
  assert.equal(funds.flagged, true)
  assert.equal(a.lines[1].drift, 0)
  assert.equal(a.lines[2].drift, -10)
  assert.deepEqual(driftNotes(a), ['Funds & ETFs is 10 points above your target of 60%.', 'Retirement accounts is 10 points below your target of 20%.'])
  const none = allocationFor(accounts, [], [], 'EUR', TODAY)
  assert.equal(none.lines[0].drift, undefined)
  assert.deepEqual(driftNotes(none), [])
})

test('a kind with a target but nothing held still shows, at zero', () => {
  const a = allocationFor([acc()], [], [], 'EUR', TODAY, { funds: 50, gold: 50 })
  const gold = a.lines.find((l) => l.id === 'gold')!
  assert.equal(gold.value, 0)
  assert.equal(gold.drift, -50)
  assert.equal(gold.flagged, true)
})

test('the target is stored with the investor profile and survives cleaning', () => {
  const p = cleanInvestorProfile({ birthYear: 1990, allocationTarget: { funds: 70, shares: 30, junk: 1 } }, 2026)
  assert.deepEqual(p.allocationTarget, { funds: 70, shares: 30 })
  assert.equal(cleanInvestorProfile({ allocationTarget: {} }, 2026).allocationTarget, undefined)
})

test('priced holdings split an account by kind; a pension stays one kind; unpriced holdings change nothing', () => {
  const hold = (over: Partial<Holding>): Holding => ({ id: 'h', accountId: 'a1', name: 'x', isin: '', symbol: '', assetClass: 'funds', quantity: 10, avgCost: null, currency: 'EUR', price: 10, priceDate: '', notes: '', createdAt: '', ...over })
  const accounts = [acc({ balance: 10000 }), acc({ id: 'a3', type: 'pension', balance: 2000 })]
  const holdings = [hold({ id: 'h1', quantity: 30, price: 10 }), hold({ id: 'h2', assetClass: 'shares', quantity: 10, price: 10 }), hold({ id: 'h3', accountId: 'a3', price: 99 }), hold({ id: 'h4', price: null, assetClass: 'gold' })]
  const a = allocationFor(accounts, [], [], 'EUR', TODAY, undefined, holdings)
  const by = Object.fromEntries(a.lines.map((l) => [l.id, l.value]))
  assert.equal(by.funds, 7500)
  assert.equal(by.shares, 2500)
  assert.equal(by.retirement, 2000)
  assert.equal(by.gold, undefined)
  assert.equal(a.total, 12000)
  // Without holdings the account's type decides
  assert.equal(allocationFor(accounts, [], [], 'EUR', TODAY).lines.find((l) => l.id === 'funds')?.value, 10000)
})
