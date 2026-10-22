import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  editDistance,
  learnFromLedger,
  matchUserRules,
  mentionsOwnName,
  merchantText,
  ownNamesFrom,
  payeeKey,
  suggestCategory,
} from '../src/lib/ledger/categorize.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const cat = (text: string, dir: 'in' | 'out' = 'out') => suggestCategory(text, dir)?.category

const tx = (id: string, date: string, description: string, category: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  date,
  direction: 'out',
  amount: 10,
  currency: 'EUR',
  account: '',
  category,
  description,
  notes: '',
  tags: [],
  documentIds: [],
  source: 'import',
  createdAt: '',
  ...over,
})

const PAYPAL = (merchant: string) =>
  `PayPal Europe S.a.r.l. et Cie S.C.A 1040123456789/. ${merchant}, Ihr Einkauf bei ${merchant}`

test('keyword rules cover the payees seen in real statements', () => {
  assert.equal(cat('Getsafe Digital GmbH Hausrat'), 'Insurance')
  assert.equal(cat('Conergia GmbH Lokalstrom Abschlag'), 'Utilities')
  assert.equal(cat('ARD ZDF Deutschlandradio Beitragsservice'), 'Utilities')
  assert.equal(cat('RSG Group GmbH Mitgliedsbeitrag'), 'Fitness')
  assert.equal(cat('Turngemeinde Hoechst Beitrag'), 'Fitness')
  assert.equal(cat('Account management fee'), 'Fees & charges')
  assert.equal(cat('Basic charge 09/2026'), 'Fees & charges')
  assert.equal(cat('Taxfix SE'), 'Taxes')
  assert.equal(cat('SKECHERS OUTLET Wertheim'), 'Shopping')
  assert.equal(cat('Asia Basar Frankfurt'), 'Groceries')
  assert.equal(cat('SBACKS Hauptbahnhof'), 'Dining out')
  assert.equal(cat('GOOGLE *Google One'), 'Subscriptions')
  assert.equal(cat('experimenta gGmbH Heilbronn'), 'Entertainment')
  assert.equal(cat('DBVERTRIEB GMBH Fahrkarte'), 'Transport')
  assert.equal(cat('Mueller sagt Danke 1234'), 'Personal care')
  assert.equal(cat('REWE Markt GmbH'), 'Groceries')
})

test('PayPal texts are unwrapped to the real merchant', () => {
  assert.equal(merchantText(PAYPAL('Netflix International B.V.')), 'Netflix International B.V.')
  assert.equal(merchantText('PAYPAL *LEBARA'), 'LEBARA')
  assert.equal(merchantText('REWE Markt'), 'REWE Markt')
  assert.equal(cat(PAYPAL('Netflix International B.V.')), 'Subscriptions')
  assert.equal(cat(PAYPAL('Lebara Germany Ltd')), 'Mobile & internet')
  assert.equal(cat(PAYPAL('Taxfix SE')), 'Taxes') // not Shopping because of "Ihr Einkauf"
  assert.notEqual(payeeKey(PAYPAL('Netflix International B.V.')), payeeKey(PAYPAL('Lebara Germany Ltd')))
})

test('learned history is per merchant, also behind PayPal', () => {
  const learned = learnFromLedger([
    tx('1', '2026-08-01', PAYPAL('Netflix International B.V.'), 'Subscriptions'),
    tx('2', '2026-08-03', PAYPAL('Zalando SE'), 'Shopping'),
  ])
  const hit = suggestCategory(PAYPAL('Netflix International B.V.'), 'out', learned)
  assert.deepEqual([hit?.category, hit?.source], ['Subscriptions', 'history'])
})

test('learned history matches near spellings of a long payee name', () => {
  assert.equal(editDistance('universal investment', 'universal investmnet'), 2)
  assert.equal(editDistance('abc', 'xyz12345'), 3)
  const learned = learnFromLedger([tx('1', '2026-07-01', 'Universal-Investment-Gesellschaft', 'Savings & investments')])
  const hit = suggestCategory('Universal Investmnet Gesellschaft', 'out', learned)
  assert.equal(hit?.category, 'Savings & investments')
  assert.equal(hit?.source, 'history')
  // Short keys never match fuzzily
  const short = learnFromLedger([tx('2', '2026-07-01', 'Lidl', 'Groceries')])
  assert.equal(suggestCategory('Lild', 'out', short), null)
})

test('payments to or from the user are transfers, unless a clear rule says otherwise', () => {
  const ownNames = ownNamesFrom('Asha Verma', [{ name: 'Ravi Verma' }, { name: 'Mum' }])
  assert.deepEqual(ownNames, ['Asha Verma', 'Ravi Verma'])
  // Names saved in the profile come first; the connector has no sign-in name
  assert.deepEqual(ownNamesFrom(undefined, [], ['  ASHA  K VERMA ', 'Asha']), ['ASHA K VERMA'])
  assert.ok(mentionsOwnName('WISE PAYMENTS LTD ASHA KUMARI VERMA', ownNames))
  assert.ok(mentionsOwnName('Verma, Asha', ownNames))
  assert.ok(!mentionsOwnName('Asha Sharma', ownNames))

  const own = { ownNames }
  assert.equal(suggestCategory('Wise Payments Ltd Asha Verma', 'out', undefined, own)?.category, 'Transfer')
  assert.equal(suggestCategory('Asha Verma Trade Republic Sparplan', 'out', undefined, own)?.category, 'Savings & investments')
  assert.equal(suggestCategory('ACME GmbH Gehalt 09/2026 Asha Verma', 'in', undefined, own)?.category, 'Salary')
  assert.equal(suggestCategory('Miete Oktober Asha Verma', 'out', undefined, own)?.category, 'Housing')
  // Without names nothing changes
  assert.equal(suggestCategory('Wise Payments Ltd Asha Verma', 'out'), null)
})

test('the user\'s own rules match case-insensitively and beat learned history and keyword rules', () => {
  const userRules = [{ match: 'lidl', category: 'Eating out' }]
  assert.equal(matchUserRules('LIDL SAGT DANKE 4711', userRules)?.category, 'Eating out')
  assert.equal(matchUserRules('Aldi', userRules), null)
  assert.equal(suggestCategory('Lidl Berlin', 'out', undefined, { userRules })?.category, 'Eating out')
  assert.equal(suggestCategory('Lidl Berlin', 'out')?.category, 'Groceries')
  const learned = learnFromLedger([tx('a', '2026-01-01', 'Lidl Berlin', 'Shopping'), tx('b', '2026-01-02', 'Lidl Berlin', 'Shopping')])
  assert.equal(suggestCategory('Lidl Berlin', 'out', learned, { userRules })?.category, 'Eating out')
})
