import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importBatches } from '../src/lib/ledger/imports.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (id: string, createdAt: string, direction: 'in' | 'out', amount: number, source: 'import' | 'manual' = 'import') =>
  ({ id, createdAt, direction, amount, source, currency: 'EUR', date: '2026-10-01', account: '', category: '', description: id, notes: '', tags: [], documentIds: [] }) as unknown as Transaction

test('imports saved together form one batch, newest batch first', () => {
  const batches = importBatches([
    tx('a', '2026-10-01T10:00:00.000Z', 'out', 20),
    tx('b', '2026-10-01T10:00:00.000Z', 'in', 1000),
    tx('c', '2026-10-05T09:00:00.000Z', 'out', 5),
  ])
  assert.equal(batches.length, 2)
  assert.equal(batches[0].createdAt, '2026-10-05T09:00:00.000Z')
  assert.equal(batches[1].count, 2)
  assert.equal(batches[1].inflow, 1000)
  assert.equal(batches[1].outflow, 20)
})

test('manual entries are never offered as an import batch', () => {
  assert.deepEqual(importBatches([tx('m', '2026-10-01T10:00:00.000Z', 'out', 9, 'manual')]), [])
})

test('a row with no save time is left out rather than grouped by accident', () => {
  assert.deepEqual(importBatches([tx('x', '', 'out', 9)]), [])
})
