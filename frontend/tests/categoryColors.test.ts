import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CATEGORY_PALETTE, categoryColor, categoryCssVars, categoryHex, categorySlug } from '../src/lib/ledger/categoryColors.ts'
import { CATEGORY_GROUPS, groupOf, groupTotals } from '../src/lib/ledger/categoryGroups.ts'
import { DEFAULT_CATEGORIES } from '../src/lib/ledger/defaults.ts'
import { INCOME_CATEGORIES, MORE_EXPENSE_CATEGORIES } from '../src/lib/ledger/types.ts'

test('every built-in spending category has its own colour slot, not Other', () => {
  for (const c of [...DEFAULT_CATEGORIES, ...MORE_EXPENSE_CATEGORIES]) assert.notEqual(categorySlug(c), 'other', c)
})

test('income is green, transfers grey, unknown categories like Other', () => {
  for (const c of INCOME_CATEGORIES) assert.equal(categorySlug(c), 'income', c)
  assert.equal(categorySlug('Transfer'), 'transfer')
  assert.equal(categorySlug('My own thing'), 'other')
  assert.equal(categorySlug(' groceries '), 'groceries')
  assert.equal(categoryColor('Housing'), 'var(--color-cat-housing)')
  assert.equal(categoryHex('Housing', 'light'), '#5b4bd6')
})

test('no category reuses the money-in or money-out colour', () => {
  const series = new Set([CATEGORY_PALETTE.income.dark, CATEGORY_PALETTE.spending.dark])
  for (const c of [...DEFAULT_CATEGORIES, ...MORE_EXPENSE_CATEGORIES]) assert.ok(!series.has(categoryHex(c, 'dark')), c)
})

test('the stylesheet defines every colour variable the code can ask for', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  for (const [name, value] of Object.entries(categoryCssVars('dark'))) {
    assert.ok(css.includes(`${name}: ${value};`), `${name} missing or different in index.css`)
  }
})

test('groups: the big four alone, the rest in Bills, Lifestyle and Other', () => {
  assert.equal(groupOf('Housing'), 'Housing')
  assert.equal(groupOf('Mobile & internet'), 'Bills')
  assert.equal(groupOf('Dining out'), 'Lifestyle')
  assert.equal(groupOf('Cash withdrawal'), 'Other')
  assert.equal(groupOf('Something new'), 'Other')
  for (const c of [...DEFAULT_CATEGORIES, ...MORE_EXPENSE_CATEGORIES]) assert.ok(CATEGORY_GROUPS.includes(groupOf(c)), c)
  assert.deepEqual(
    groupTotals([
      { category: 'Utilities', amount: 50 },
      { category: 'Housing', amount: 1150 },
      { category: 'Subscriptions', amount: 13.99 },
      { category: 'Travel', amount: 200 },
    ]),
    [
      { group: 'Housing', amount: 1150 },
      { group: 'Bills', amount: 63.99 },
      { group: 'Lifestyle', amount: 200 },
    ],
  )
})
