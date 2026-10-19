import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRASH_COLUMNS, daysLeft, expiredItems, rowToTrash, trashToRow, type TrashItem } from '../src/lib/ledger/trash.ts'

const item = (deletedAt: string, over: Partial<TrashItem> = {}): TrashItem => ({
  id: 'tx_1',
  kind: 'transaction',
  deletedAt,
  title: 'REWE 54.20',
  payload: { amount: 54.2 },
  ...over,
})

test('a trashed item round-trips with its original payload', () => {
  const row = trashToRow(item('2026-10-01T10:00:00Z'))
  assert.equal(row.length, TRASH_COLUMNS.length)
  const back = rowToTrash(row, 4)!
  assert.deepEqual(back.payload, { amount: 54.2 })
  assert.equal(back.kind, 'transaction')
  assert.equal(back.row, 4)
})

test('unknown kinds and unreadable payloads are not restored', () => {
  assert.equal(rowToTrash(['x', 'account', '2026-10-01', 'a', '{}'], 2), null)
  assert.equal(rowToTrash(['x', 'document', '2026-10-01', 'a', 'not json'], 2), null)
  assert.equal(rowToTrash(['', 'document', '2026-10-01', 'a', '{}'], 2), null)
})

test('items are erased after 30 days, and not before', () => {
  const removed = item('2026-10-01T10:00:00Z')
  const day29 = new Date('2026-10-30T09:59:00Z')
  const day31 = new Date('2026-11-01T10:01:00Z')
  assert.deepEqual(expiredItems([removed], day29), [])
  assert.deepEqual(expiredItems([removed], day31), [removed])
})

test('an item with an unreadable removal time is kept, never erased by mistake', () => {
  const broken = item('not a date')
  assert.deepEqual(expiredItems([broken], new Date('2030-01-01T00:00:00Z')), [])
})

test('days left counts down and stops at zero', () => {
  const removed = item('2026-10-01T10:00:00Z')
  assert.equal(daysLeft(removed, new Date('2026-10-01T12:00:00Z')), 30)
  assert.equal(daysLeft(removed, new Date('2026-10-20T00:00:00Z')), 12)
  assert.equal(daysLeft(removed, new Date('2030-01-01T00:00:00Z')), 0)
})

test('a transaction goes to trash without its sheet row, and keeps every field', async () => {
  const { transactionToTrash } = await import('../src/lib/ledger/trash.ts')
  const tx = { id: 'tx_9', date: '2026-10-02', direction: 'out', amount: 12, currency: 'EUR', account: 'Main', category: 'Food', description: 'Bakery', notes: '', tags: [], documentIds: [], source: 'manual', createdAt: '2026-10-02T08:00:00Z', row: 7 } as never
  const item = transactionToTrash(tx, new Date('2026-10-03T00:00:00Z'))
  assert.equal(item.kind, 'transaction')
  assert.equal(item.deletedAt, '2026-10-03T00:00:00.000Z')
  assert.equal('row' in (item.payload as object), false)
  assert.equal((item.payload as { description: string }).description, 'Bakery')
})
