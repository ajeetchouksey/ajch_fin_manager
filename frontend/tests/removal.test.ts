import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountRemovalImpact } from '../src/lib/ledger/removal.ts'

const acc = { id: 'acc_1', name: 'Savings' }

test('counts transactions linked by id, and by name for older rows', () => {
  const impact = accountRemovalImpact(
    acc,
    [{ accountId: 'acc_1', account: 'Savings' }, { account: 'Savings' }, { accountId: 'acc_2', account: 'Savings' }, { account: 'Current' }],
    [{ accountId: 'acc_1' }, { accountId: 'acc_1' }, { accountId: 'acc_2' }],
  )
  assert.deepEqual(impact, { transactions: 2, balanceRecords: 2 })
})

test('an account with nothing linked reports zero', () => {
  assert.deepEqual(accountRemovalImpact(acc, [], []), { transactions: 0, balanceRecords: 0 })
})
