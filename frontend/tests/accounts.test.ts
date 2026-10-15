import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeIban,
  editDistance,
  ibanFingerprint,
  normaliseIban,
  planLabelMigration,
  suggestAccountType,
  suggestInstitution,
} from '../src/lib/ledger/accounts.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

// A German IBAN with the Commerzbank bank code 50040000, with the check digits worked out here
function germanIban(bban: string): string {
  for (let check = 0; check < 100; check++) {
    const candidate = `DE${String(check).padStart(2, '0')}${bban}`
    if (normaliseIban(candidate)) return candidate
  }
  throw new Error('no check digits')
}
const COMMERZ = germanIban('500400000387814700')

const tx = (category: string, direction: 'in' | 'out' = 'out'): Transaction =>
  ({ id: category, date: '2026-10-01', direction, amount: 10, currency: 'EUR', account: 'Savings', category, description: category, notes: '', tags: [], documentIds: [], source: 'import', createdAt: '' }) as Transaction

test('an IBAN is accepted only with valid check digits, and spaces are ignored', () => {
  assert.equal(normaliseIban('DE89 3704 0044 0532 0130 00'), 'DE89370400440532013000')
  assert.equal(normaliseIban('DE89370400440532013001'), null, 'a changed digit fails the check')
  assert.equal(normaliseIban('not an iban'), null)
})

test('only the last four characters and the bank are kept for a German IBAN', () => {
  const info = describeIban(COMMERZ)
  assert.equal(info.last4, COMMERZ.slice(-4))
  assert.equal(info.bankCode, '50040000')
  assert.equal(info.institution, 'Commerzbank')
  assert.ok(!JSON.stringify(info).includes(COMMERZ), 'the full IBAN is not in what gets stored')
})

test('the fingerprint recognises the same IBAN with the same salt and tells others apart', async () => {
  const a = await ibanFingerprint(COMMERZ, 'user-salt')
  assert.equal(a, await ibanFingerprint(COMMERZ, 'user-salt'))
  assert.notEqual(a, await ibanFingerprint(COMMERZ, 'other-salt'))
  assert.notEqual(a, await ibanFingerprint(germanIban('500400000011112222'), 'user-salt'))
  assert.ok(!a.includes(COMMERZ))
})

test('edit distance counts single-letter typos', () => {
  assert.equal(editDistance('CoomerzBank', 'Commerzbank'), 1)
  assert.equal(editDistance('same', 'same'), 0)
})

test('a name one or two letters from a known bank gets the correction, a correct name does not', () => {
  assert.equal(suggestInstitution('CoomerzBank'), 'Commerzbank')
  assert.equal(suggestInstitution('Commerzbank'), null)
  assert.equal(suggestInstitution('Sparkasse'), null, 'too far away to guess')
})

test('the account type follows the rows: salary or direct debits mean current, interest only means savings', () => {
  assert.equal(suggestAccountType([tx('Salary', 'in'), tx('Groceries')]), 'current')
  assert.equal(suggestAccountType([tx('Rent')]), 'current')
  assert.equal(suggestAccountType([tx('Interest', 'in')]), 'savings')
  assert.equal(suggestAccountType([tx('Groceries')]), null, 'no clear signal, so the user decides')
})

test('the migration preview counts what would be linked and writes nothing', () => {
  const rows = [
    { account: 'Savings' },
    { account: 'Savings' },
    { account: 'Savings', accountId: 'acc_1' },
    { account: 'Wise' },
    { account: '' },
  ]
  assert.deepEqual(planLabelMigration(rows, 'Savings'), { toLink: 2, alreadyLinked: 1, otherLabels: { Wise: 1 }, unlabelled: 1 })
})
