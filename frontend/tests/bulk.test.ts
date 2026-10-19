import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planRecategorise } from '../src/lib/ledger/bulk.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const tx = (id: string, direction: 'in' | 'out', category: string) =>
  ({ id, direction, category, amount: 10, currency: 'EUR', date: '2026-10-01', account: '', description: id, notes: '', tags: [], documentIds: [], source: 'manual', createdAt: '2026-10-01T00:00:00Z' }) as unknown as Transaction

const fits = (d: 'in' | 'out', c: string) => (d === 'in' ? c === 'Salary' : c !== 'Salary')

test('changes only rows whose category differs, and keeps the original row for undo', () => {
  const plan = planRecategorise([tx('a', 'out', 'Other'), tx('b', 'out', 'Food'), tx('c', 'out', 'Food')], 'Food', fits)
  assert.equal(plan.changes.length, 1)
  assert.equal(plan.changes[0].before.category, 'Other')
  assert.equal(plan.changes[0].after.category, 'Food')
  assert.equal(plan.unchanged, 2)
})

test('money in is never moved to an expense category, and is reported as skipped', () => {
  const plan = planRecategorise([tx('i', 'in', 'Other'), tx('o', 'out', 'Other')], 'Food', fits)
  assert.equal(plan.skipped, 1)
  assert.equal(plan.changes.length, 1)
  assert.equal(plan.changes[0].after.id, 'o')
})

test('transfers keep their category', () => {
  const plan = planRecategorise([tx('t', 'out', 'Transfer')], 'Food', fits)
  assert.equal(plan.transfers, 1)
  assert.equal(plan.changes.length, 0)
})
