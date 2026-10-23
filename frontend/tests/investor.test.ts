import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ageIn, cleanInvestorProfile, isEmptyInvestor } from '../src/lib/ledger/investor.ts'
import { mergeProfile, profileToRows, rowsToProfile } from '../src/lib/ledger/profile.ts'

test('only valid answers are kept, nothing is guessed', () => {
  assert.deepEqual(cleanInvestorProfile({ birthYear: 1988, employment: 'employed', incomeStability: 'stable' }, 2026), { birthYear: 1988, employment: 'employed', incomeStability: 'stable' })
  assert.deepEqual(cleanInvestorProfile({ birthYear: '1988', employment: 'astronaut', incomeStability: 7 }, 2026), { birthYear: 1988 })
  assert.deepEqual(cleanInvestorProfile({ birthYear: 1850 }, 2026), {})
  assert.deepEqual(cleanInvestorProfile({ birthYear: 2020 }, 2026), {})
  assert.deepEqual(cleanInvestorProfile({ birthYear: '' }, 2026), {})
  assert.deepEqual(cleanInvestorProfile(null), {})
  assert.deepEqual(cleanInvestorProfile('x'), {})
})

test('age comes from the birth year, and is unknown without one', () => {
  assert.equal(ageIn({ birthYear: 1988 }, 2026), 38)
  assert.equal(ageIn({}, 2026), undefined)
  assert.equal(ageIn(undefined, 2026), undefined)
  assert.ok(isEmptyInvestor({}))
  assert.ok(!isEmptyInvestor({ employment: 'student' }))
})

test('the answers are saved in the Profile tab and read back; an empty set leaves no field', () => {
  const base = { residenceCountries: ['DE'], accountTypes: [], expenseCategories: [] }
  const saved = mergeProfile(base, { investorProfile: { birthYear: 1990, employment: 'self_employed' } })
  const back = rowsToProfile(profileToRows(saved, '2026-10-23').map((r) => ({ ...r, row: 2 })))
  assert.deepEqual(back?.investorProfile, { birthYear: 1990, employment: 'self_employed' })
  const cleared = mergeProfile(saved, { investorProfile: {} })
  assert.equal(rowsToProfile(profileToRows(cleared, '2026-10-23'))?.investorProfile, undefined)
})
