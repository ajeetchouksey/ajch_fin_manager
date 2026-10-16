import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILE_COLUMNS,
  completedSections,
  mergeProfile,
  profileRowToRow,
  profileToRows,
  rowToProfileRow,
  rowsToProfile,
  sameProfile,
} from '../src/lib/ledger/profile.ts'
import type { UserSchemaDefinition } from '../src/types/index.ts'

const full: UserSchemaDefinition = {
  residenceCountries: ['DE', 'IN'],
  accountTypes: ['current', 'savings'],
  expenseCategories: ['Groceries', 'Housing'],
  declaredGoals: ['Holiday'],
  householdMembers: [{ name: 'Partner', relationship: 'spouse' }],
  investmentPreferences: { hasInvestments: true, types: ['etf'] },
  taxSettings: { country: 'DE', fillingStatus: 'joint' },
}

test('a profile round-trips through the Profile tab rows', () => {
  const rows = profileToRows(full, '2026-10-16T10:00:00Z').map((r, i) => rowToProfileRow(profileRowToRow(r), i + 2)!)
  assert.equal(profileRowToRow(rows[0]).length, PROFILE_COLUMNS.length)
  assert.ok(sameProfile(rowsToProfile(rows), full))
})

test('missing optional fields stay missing, and an empty tab is no profile', () => {
  const minimal: UserSchemaDefinition = { residenceCountries: ['DE'], accountTypes: [], expenseCategories: [] }
  const rows = profileToRows(minimal, 'now').map((r, i) => rowToProfileRow(profileRowToRow(r), i + 2)!)
  const back = rowsToProfile(rows)!
  assert.equal(back.declaredGoals, undefined)
  assert.equal(back.taxSettings, undefined)
  assert.equal(rowsToProfile([]), null)
})

test('unknown keys and unreadable values are skipped, never guessed', () => {
  assert.equal(rowToProfileRow(['somethingElse', '"x"', ''], 2), null)
  assert.equal(rowToProfileRow(['residenceCountries', 'not json', ''], 3), null)
})

test('an update replaces the fields it sends and keeps the rest', () => {
  const merged = mergeProfile(full, { declaredGoals: [], taxSettings: { country: 'IN' } })
  assert.deepEqual(merged.declaredGoals, [], 'un-ticking all goals sticks')
  assert.deepEqual(merged.taxSettings, { country: 'IN' })
  assert.deepEqual(merged.residenceCountries, ['DE', 'IN'], 'fields not sent are kept')
  assert.deepEqual(mergeProfile(null, { residenceCountries: ['DE'] }).accountTypes, [])
})

test('completed sections follow the same rules as the server did', () => {
  assert.deepEqual(completedSections(full), ['countries', 'accounts', 'categories', 'goals', 'household', 'investments', 'tax'])
  assert.deepEqual(completedSections({ residenceCountries: [], accountTypes: ['current'], expenseCategories: [] }), ['accounts'])
  assert.deepEqual(completedSections(null), [])
})

test('profiles compare equal regardless of key order, and differ on any value', () => {
  const reordered = { ...full, taxSettings: { fillingStatus: 'joint', country: 'DE' } }
  assert.ok(sameProfile(full, reordered))
  assert.ok(!sameProfile(full, { ...full, householdMembers: [] }))
  assert.ok(!sameProfile(full, null))
})
