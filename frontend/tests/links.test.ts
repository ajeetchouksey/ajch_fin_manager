import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkedWith, makeLink, parseLink, unlinkRows } from '../src/lib/ledger/links.ts'
import { findRefunds, findTransferPairs, worthChecking } from '../src/lib/ledger/checks.ts'
import { rowToTransaction, transactionToRow, TRANSACTION_COLUMNS, type Transaction } from '../src/lib/ledger/types.ts'

let n = 0
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't' + ++n, date: '2026-10-20', direction: 'out', amount: 500, currency: 'EUR', account: 'Current', category: 'Other',
  description: 'x', notes: '', tags: [], documentIds: [], source: 'import', createdAt: '', ...over,
})

test('the link column is the last one and survives a round trip; old rows have none', () => {
  assert.equal(TRANSACTION_COLUMNS.at(-1), 'link')
  const t = tx({ link: 'transfer:abc' })
  assert.equal(rowToTransaction(transactionToRow(t), 2)?.link, 'transfer:abc')
  assert.equal(transactionToRow(tx()).at(-1), '')
  const old = transactionToRow(tx()).slice(0, 14)
  assert.equal(rowToTransaction(old, 2)?.link, undefined)
})

test('only well-formed links are read', () => {
  assert.deepEqual(parseLink(makeLink('refund', 'tx_1')), { kind: 'refund', ref: 'tx_1' })
  assert.equal(parseLink('transfer:'), null)
  assert.equal(parseLink('other:abc'), null)
  assert.equal(parseLink(undefined), null)
})

test('the fix for a transfer pair links both legs, and a linked row is not offered again', () => {
  const out = tx({ id: 'o1', account: 'Current' })
  const inn = tx({ id: 'i1', account: 'Tagesgeld', direction: 'in', date: '2026-10-21' })
  const c = worthChecking([out, inn]).find((x) => x.kind === 'transfer-pair')
  assert.deepEqual(c?.links, [{ id: 'o1', link: 'transfer:o1' }, { id: 'i1', link: 'transfer:o1' }])
  assert.equal(findTransferPairs([{ ...out, link: 'transfer:o1' }, { ...inn, link: 'transfer:o1' }]).length, 0)
})

test('the fix for a refund links it to its purchase', () => {
  const buy = tx({ id: 'b1', description: 'Zalando', category: 'Shopping', amount: 80 })
  const back = tx({ id: 'r1', description: 'Zalando', category: 'Other income', amount: 80, direction: 'in', date: '2026-10-25' })
  const c = worthChecking([buy, back], { today: '2026-10-30' }).find((x) => x.kind === 'refund-pair')
  assert.deepEqual(c?.links, [{ id: 'r1', link: 'refund:b1' }])
  assert.equal(findRefunds([buy, { ...back, link: 'refund:b1' }]).length, 0)
})

test('linked rows are found from either side, and unlinking a transfer frees both legs', () => {
  const a = tx({ id: 'a', link: 'transfer:z' })
  const b = tx({ id: 'b', link: 'transfer:z', direction: 'in' })
  const other = tx({ id: 'c' })
  assert.deepEqual(linkedWith([a, b, other], a).map((t) => t.id), ['b'])
  assert.deepEqual(unlinkRows([a, b, other], a).map((t) => [t.id, t.link]), [['a', undefined], ['b', undefined]])
  const buy = tx({ id: 'p' })
  const back = tx({ id: 'q', link: 'refund:p', direction: 'in' })
  assert.deepEqual(linkedWith([buy, back], buy).map((t) => t.id), ['q'])
  assert.deepEqual(linkedWith([buy, back], back).map((t) => t.id), ['p'])
  assert.deepEqual(unlinkRows([buy, back], back).map((t) => t.id), ['q'])
})
