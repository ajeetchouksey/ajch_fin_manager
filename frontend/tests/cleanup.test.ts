import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unresolvedPayees } from '../src/lib/ledger/cleanup.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

let n = 0
const tx = (description: string, category: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: 't' + ++n, date: '2026-10-01', direction: 'out', amount, currency: 'EUR', account: '', category, description,
  notes: '', tags: [], documentIds: [], source: 'import', createdAt: '', ...over,
})

test('payments in Other or without a category are grouped by payee, biggest first', () => {
  const rows = [tx('Kiosk Mitte', 'Other', 5), tx('KIOSK MITTE', '', 7), tx('Apotheke', 'Other', 40), tx('REWE', 'Groceries', 20)]
  const found = unresolvedPayees(rows)
  assert.deepEqual(found.map((g) => [g.label.toLowerCase(), g.count, g.total]), [['apotheke', 1, 40], ['kiosk mitte', 2, 12]])
})

test('a hint comes from the user rules, never from Other itself', () => {
  const rows = [tx('Vodafone GmbH', 'Other', 30), tx('Mystery', 'Other', 10)]
  const found = unresolvedPayees(rows, { userRules: [{ match: 'vodafone', category: 'Mobile & internet' }] })
  assert.deepEqual(found.find((g) => g.label.startsWith('Vodafone'))?.hint, { category: 'Mobile & internet', source: 'rule' })
  assert.equal(found.find((g) => g.label === 'Mystery')?.hint, null)
})

test('money in and money out of one payee are separate groups, and the list is capped', () => {
  const rows = [tx('Anna', 'Other', 10), tx('Anna', 'Other income', 10, { direction: 'in' }), ...Array.from({ length: 8 }, (_, i) => tx(['Bäckerei', 'Metzger', 'Friseur', 'Tankstelle', 'Buchhandlung', 'Blumen', 'Optiker', 'Reinigung'][i] + ' ' + 'xyz'.repeat(0), 'Other', i + 1))]
  assert.equal(unresolvedPayees(rows, { limit: 5 }).length, 5)
  assert.equal(unresolvedPayees(rows.slice(0, 2)).length, 2)
})
