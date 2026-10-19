import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentChecklist, filingDeadlines, yearBounds } from '../src/lib/tax/checklist.ts'
import type { LedgerDocument } from '../src/lib/ledger/types.ts'

const doc = (id: string, type: string, date: string, tags: string[] = []) =>
  ({ id, type, date, tags, title: id, notes: '', transactionIds: [], fileName: '', mimeType: '', link: '', uploadedAt: '' }) as unknown as LedgerDocument

test('German years run January to December; Indian years run April to March', () => {
  assert.deepEqual(yearBounds('DE', 2025), { start: '2025-01-01', end: '2025-12-31' })
  assert.deepEqual(yearBounds('IN', 2025), { start: '2025-04-01', end: '2026-03-31' })
})

test('a document counts for the year only when dated inside it', () => {
  const docs = [doc('form16', 'Tax document', '2026-03-31', ['form16']), doc('late', 'Tax document', '2026-04-01', ['form16'])]
  const form16 = documentChecklist(docs, 'IN', 2025).find((i) => i.label.startsWith('Form 16'))!
  assert.deepEqual(form16.found.map((d) => d.id), ['form16'])
  assert.equal(form16.missing, false)
})

test('an item with no matching document is marked missing', () => {
  const result = documentChecklist([doc('r', 'Receipt', '2025-06-01')], 'DE', 2025)
  const donations = result.find((i) => i.label.startsWith('Donation'))!
  assert.equal(donations.missing, true)
})

test('tagged documents satisfy the item they are filed under', () => {
  const result = documentChecklist([doc('d', 'Receipt', '2025-05-10', ['tax:de:spenden'])], 'DE', 2025)
  assert.equal(result.find((i) => i.label.startsWith('Donation'))!.missing, false)
})

test('India FY 2025-26 has its checked filing dates, and other years are not covered', () => {
  const india = filingDeadlines('IN', 2025)
  assert.equal(india.covered, true)
  assert.deepEqual(india.deadlines.map((d) => d.date), ['2026-07-31', '2026-08-31', '2026-12-31'])
  assert.deepEqual(filingDeadlines('IN', 2026), { deadlines: [], covered: false })
  assert.equal(filingDeadlines('DE', 2025).deadlines[0].date, '2026-07-31')
  assert.equal(filingDeadlines('DE', 2024).covered, false)
})
