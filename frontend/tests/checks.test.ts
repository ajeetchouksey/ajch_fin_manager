import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findRefunds, findTransferPairs, worthChecking } from '../src/lib/ledger/checks.ts'
import { groupPayees, samePayee } from '../src/lib/ledger/payees.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

let n = 0
const tx = (date: string, description: string, category: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  date,
  direction: 'out',
  amount,
  currency: 'EUR',
  account: '',
  category,
  description,
  notes: '',
  tags: [],
  documentIds: [],
  source: 'import',
  createdAt: '',
  ...over,
})

const kinds = (tx: Transaction[], o = {}) => worthChecking(tx, o).map((c) => c.kind)

test('payee spellings are grouped', () => {
  assert.ok(samePayee('universal investment gesellschaft', 'universal investment gmbh'))
  assert.ok(!samePayee('deutsche bahn', 'deutsche telekom'))
  const g = groupPayees([
    tx('2026-07-01', 'Universal-Investment-Gesellschaft mbH', 'Savings & investments', 100),
    tx('2026-08-01', 'UNIVERSAL INVESTMENT GMBH', 'Savings & investments', 100),
    tx('2026-08-02', 'REWE Markt', 'Groceries', 30),
  ])
  assert.equal(g.length, 2)
  const ui = g.find((x) => x.tx.length === 2)!
  assert.equal(ui.keys.length, 2)
  assert.ok(kinds(ui.tx).includes('payee-variants'))
})

test('a steady monthly income not marked Salary is flagged', () => {
  const rows = ['2026-06-28', '2026-07-30', '2026-08-28', '2026-09-29'].map((d) =>
    tx(d, 'AVANADE DEUTSCHLAND GMBH', 'Other income', 4941, { direction: 'in' }),
  )
  const c = worthChecking(rows).find((x) => x.kind === 'likely-salary')
  assert.ok(c)
  assert.equal(c.suggestedCategory, 'Salary')
  assert.equal(c.transactionIds.length, 4)
  // Already Salary: nothing to say
  assert.ok(!kinds(rows.map((r) => ({ ...r, category: 'Salary' }))).includes('likely-salary'))
})

test('category drift for a regular payee', () => {
  const rows = [
    tx('2026-06-03', 'Getsafe Digital GmbH', 'Insurance', 6.9),
    tx('2026-07-03', 'Getsafe Digital GmbH', 'Insurance', 6.9),
    tx('2026-08-03', 'Getsafe Digital GmbH', 'Insurance', 6.9),
    tx('2026-09-03', 'Getsafe Digital GmbH', 'Shopping', 6.9),
  ]
  const c = worthChecking(rows).find((x) => x.kind === 'category-drift')
  assert.ok(c)
  assert.equal(c.suggestedCategory, 'Insurance')
  assert.deepEqual(c.transactionIds, [rows[3].id])
})

test('own-name payments that are not transfers', () => {
  const rows = [tx('2026-09-10', 'Wise Payments Ltd Asha Verma', 'Other', 500), tx('2026-09-12', 'Wise Payments Ltd Asha Verma', 'Transfer', 300)]
  const c = worthChecking(rows, { ownNames: ['Asha Verma'] }).find((x) => x.kind === 'own-transfer')
  assert.ok(c)
  assert.deepEqual(c.transactionIds, [rows[0].id])
  assert.ok(!kinds(rows).includes('own-transfer'))
})

test('double and missing monthly payments', () => {
  const rows = [
    tx('2026-04-01', 'Lebara Germany', 'Mobile & internet', 10),
    tx('2026-05-01', 'Lebara Germany', 'Mobile & internet', 10),
    tx('2026-06-01', 'Lebara Germany', 'Mobile & internet', 10),
    tx('2026-06-15', 'Lebara Germany', 'Mobile & internet', 10),
    tx('2026-08-01', 'Lebara Germany', 'Mobile & internet', 10),
    tx('2026-09-01', 'Lebara Germany', 'Mobile & internet', 10),
  ]
  const cs = worthChecking(rows)
  const dbl = cs.find((x) => x.kind === 'double-payment')
  assert.ok(dbl && dbl.title.includes('June 2026'))
  assert.equal(dbl.transactionIds.length, 2)
  const miss = cs.find((x) => x.kind === 'missing-payment')
  assert.ok(miss && miss.title.includes('July 2026'))
})

test('groceries bought several times a month are not "double payments"', () => {
  const rows = ['04', '05', '06', '07'].flatMap((m) => [1, 8, 15, 22].map((d) => tx(`2026-${m}-${String(d).padStart(2, '0')}`, 'REWE Markt', 'Groceries', 40)))
  assert.ok(!kinds(rows).includes('double-payment'))
})

test('Other share of the latest month', () => {
  const rows = [tx('2026-09-02', 'REWE', 'Groceries', 80), tx('2026-09-05', 'Something odd', 'Other', 20)]
  const c = worthChecking(rows).find((x) => x.kind === 'other-share')
  assert.ok(c && c.title.startsWith('20%'))
  assert.ok(!kinds(rows, { otherShareLimit: 0.25 }).includes('other-share'))
})

test('two legs of a move between own accounts are paired', () => {
  const a = tx('2026-10-20', 'Tagesgeld', 'Other', 500, { account: 'Current', direction: 'out' })
  const b = tx('2026-10-21', 'Einzahlung', 'Other income', 500, { account: 'Tagesgeld', direction: 'in' })
  const pairs = findTransferPairs([a, b])
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].days, 1)
  const c = worthChecking([a, b]).find((x) => x.kind === 'transfer-pair')
  assert.deepEqual(c?.transactionIds, [a.id, b.id])
  assert.equal(c?.suggestedCategory, 'Transfer')
})

test('pairing needs different accounts, same amount and currency, and a few days', () => {
  const out = tx('2026-10-20', 'x', 'Other', 500, { account: 'Current' })
  const sameAccount = tx('2026-10-20', 'y', 'Other income', 500, { account: 'Current', direction: 'in' })
  const otherAmount = tx('2026-10-20', 'y', 'Other income', 499.99, { account: 'Tagesgeld', direction: 'in' })
  const otherCurrency = tx('2026-10-20', 'y', 'Other income', 500, { account: 'Tagesgeld', direction: 'in', currency: 'INR' })
  const late = tx('2026-10-25', 'y', 'Other income', 500, { account: 'Tagesgeld', direction: 'in' })
  assert.equal(findTransferPairs([out, sameAccount, otherAmount, otherCurrency, late]).length, 0)
})

test('an ambiguous or already handled pair is left to the user', () => {
  const out = tx('2026-10-20', 'x', 'Other', 500, { account: 'Current' })
  const in1 = tx('2026-10-20', 'y', 'Other income', 500, { account: 'Tagesgeld', direction: 'in' })
  const in2 = tx('2026-10-20', 'z', 'Other income', 500, { account: 'Depot', direction: 'in' })
  assert.equal(findTransferPairs([out, in1, in2]).length, 0)
  const done = tx('2026-10-20', 'x', 'Transfer', 500, { account: 'Current' })
  assert.equal(findTransferPairs([done, in1]).length, 0)
  const noAccount = tx('2026-10-20', 'x', 'Other', 500, { account: '' })
  assert.equal(findTransferPairs([noAccount, in1]).length, 0)
})

test('a refund is linked to the purchase it undoes', () => {
  const buy = tx('2026-09-10', 'Zalando', 'Shopping', 80, { account: 'Current' })
  const back = tx('2026-09-20', 'Zalando', 'Other income', 80, { account: 'Current', direction: 'in' })
  const pairs = findRefunds([buy, back])
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].purchase.id, buy.id)
  const c = worthChecking([buy, back], { today: '2026-10-22' }).find((x) => x.kind === 'refund-pair')
  assert.deepEqual(c?.transactionIds, [back.id])
  assert.equal(c?.suggestedCategory, 'Shopping')
})

test('refunds are not guessed: partial with two purchases, too old, too large, or already netted', () => {
  const a = tx('2026-09-01', 'Zalando', 'Shopping', 80)
  const b = tx('2026-09-05', 'Zalando', 'Shopping', 60)
  const partial = tx('2026-09-20', 'Zalando', 'Other income', 30, { direction: 'in' })
  assert.equal(findRefunds([a, b, partial]).length, 0)
  const old = tx('2026-01-01', 'Zalando', 'Shopping', 80)
  assert.equal(findRefunds([old, tx('2026-09-20', 'Zalando', 'Other income', 80, { direction: 'in' })]).length, 0)
  assert.equal(findRefunds([a, tx('2026-09-20', 'Zalando', 'Other income', 90, { direction: 'in' })]).length, 0)
  const sameCat = tx('2026-09-20', 'Zalando', 'Shopping', 80, { direction: 'in' })
  assert.ok(!kinds([a, sameCat], { today: '2026-10-22' }).includes('refund-pair'))
})

test('hygiene: future dates, unreadable dates and empty categories are flagged', () => {
  const future = tx('2026-12-31', 'Kiosk', 'Other', 5)
  const broken = tx('31/12/2026', 'Kiosk', 'Other', 5)
  const blank = tx('2026-10-01', 'Kiosk', '', 5)
  const ok = tx('2026-10-01', 'Kiosk', 'Other', 5)
  const found = worthChecking([future, broken, blank, ok], { today: '2026-10-22' })
  assert.deepEqual(found.filter((c) => c.kind === 'odd-date').map((c) => c.id).sort(), ['odd-date:future', 'odd-date:invalid'])
  assert.deepEqual(found.find((c) => c.kind === 'missing-category')?.transactionIds, [blank.id])
})

const monthly = (name: string, from: string[], amount: number | number[]) =>
  from.map((d, i) => tx(d, name, 'Subscriptions', Array.isArray(amount) ? amount[i] : amount))

test('a steady monthly payment that changes price is flagged', () => {
  const rows = monthly('Netflix', ['2026-05-06', '2026-06-06', '2026-07-06', '2026-08-06', '2026-09-06'], [12.99, 12.99, 12.99, 12.99, 15.99])
  const c = worthChecking(rows, { today: '2026-09-20' }).find((x) => x.kind === 'price-change')
  assert.match(c?.title ?? '', /went up 23%/)
  assert.deepEqual(c?.transactionIds, [rows[4].id])
})

test('varying bills and unchanged prices are not price changes', () => {
  const same = monthly('Netflix', ['2026-05-06', '2026-06-06', '2026-07-06', '2026-08-06'], 12.99)
  const bill = monthly('Stadtwerke', ['2026-05-06', '2026-06-06', '2026-07-06', '2026-08-06'], [55, 80, 62, 97])
  assert.ok(!kinds([...same, ...bill], { today: '2026-08-20' }).includes('price-change'))
})

test('a monthly payment that stops is noticed, but only after two quiet months', () => {
  const rows = monthly('Gym', ['2026-03-03', '2026-04-03', '2026-05-03', '2026-06-03'], 29.9)
  assert.ok(!kinds(rows, { today: '2026-07-20' }).includes('series-stopped'))
  const c = worthChecking(rows, { today: '2026-09-20' }).find((x) => x.kind === 'series-stopped')
  assert.match(c?.title ?? '', /not been paid for 3 months/)
})

test('statement balances that do not add up with the transactions are flagged', () => {
  const acct = { id: 'a1', name: 'Current', type: 'current', institution: '', currency: 'EUR', balance: 0, asOf: '2026-09-01', rate: null, monthly: 0, notes: '', createdAt: '' }
  const hist = (date: string, balance: number) => ({ accountId: 'a1', date, balance, recordedAt: date })
  const rows = [
    tx('2026-09-05', 'Rent', 'Housing', 800, { accountId: 'a1', account: 'Current' }),
    tx('2026-09-10', 'Salary', 'Salary', 2000, { accountId: 'a1', account: 'Current', direction: 'in' }),
  ]
  const ok = worthChecking(rows, { today: '2026-10-22', accounts: [acct], balances: [hist('2026-09-01', 1000), hist('2026-09-30', 2200)] })
  assert.ok(!ok.some((c) => c.kind === 'balance-drift'))
  const off = worthChecking(rows, { today: '2026-10-22', accounts: [acct], balances: [hist('2026-09-01', 1000), hist('2026-09-30', 2150)] })
  const c = off.find((x) => x.kind === 'balance-drift')
  assert.match(c?.detail ?? '', /50[.,]00.*less than expected/)
  assert.equal(c?.transactionIds.length, 2)
})

test('investments are not checked for drift and one balance is not enough', () => {
  const depot = { id: 'd1', name: 'Depot', type: 'etf_depot', institution: '', currency: 'EUR', balance: 0, asOf: '2026-09-01', rate: null, monthly: 0, notes: '', createdAt: '' }
  const hist = (date: string, balance: number) => ({ accountId: 'd1', date, balance, recordedAt: date })
  assert.ok(!worthChecking([], { accounts: [depot], balances: [hist('2026-09-01', 1000), hist('2026-09-30', 5000)] }).some((c) => c.kind === 'balance-drift'))
  const cur = { ...depot, id: 'a1', type: 'current' }
  assert.ok(!worthChecking([], { accounts: [cur], balances: [{ accountId: 'a1', date: '2026-09-01', balance: 10, recordedAt: '' }] }).some((c) => c.kind === 'balance-drift'))
})
