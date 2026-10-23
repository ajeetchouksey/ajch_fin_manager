import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanInvestorProfile } from '../src/lib/ledger/investor.ts'
import { ability, abilityFactors, goalNeeds, ledgerRiskInputs, requiredReturn, togetherNote, willingness } from '../src/lib/ledger/risk.ts'
import type { Account, Goal } from '../src/lib/ledger/portfolio.ts'
import type { Transaction } from '../src/lib/ledger/types.ts'

const TODAY = '2026-10-23'

test('willingness needs four answers and follows their average', () => {
  assert.equal(willingness(undefined).level, null)
  assert.equal(willingness({ fall: 1, range: 1, feeling: 1 }).level, null)
  assert.equal(willingness({ fall: 1, range: 1, feeling: 2, wait: 1 }).level, 'low')
  assert.equal(willingness({ fall: 2, range: 3, feeling: 2, wait: 3 }).level, 'medium')
  assert.equal(willingness({ fall: 4, range: 4, feeling: 3, wait: 4, experience: 3 }).level, 'high')
})

test('risk answers are read back only when valid', () => {
  assert.deepEqual(cleanInvestorProfile({ riskAnswers: { fall: 3, range: 9, 'bad id!': 2, wait: '4' } }).riskAnswers, { fall: 3 })
  assert.equal(cleanInvestorProfile({ riskAnswers: {} }).riskAnswers, undefined)
})

test('the return a goal needs: zero when saving is enough, a rate that lands on the target, null when out of reach', () => {
  assert.equal(requiredReturn(0, 100, 12, 1200), 0)
  const r = requiredReturn(0, 100, 120, 15000)!
  assert.ok(r > 0.03 && r < 0.08, String(r))
  const i = Math.pow(1 + r, 1 / 12) - 1
  const fv = 100 * ((Math.pow(1 + i, 120) - 1) / i)
  assert.ok(Math.abs(fv - 15000) < 5, String(fv))
  assert.equal(requiredReturn(0, 10, 12, 1_000_000), null)
})

test('goals that are reached, past or without a date are left out; the rest get a level', () => {
  const g = (over: Partial<Goal>): Goal => ({ id: 'g' + Math.random(), name: 'G', target: 10000, currency: 'EUR', targetDate: '2031-10', saved: 0, monthly: 100, accountId: '', priority: 'medium', notes: '', createdAt: '', ...over })
  const needs = goalNeeds([g({ name: 'a' }), g({ name: 'reached', saved: 10000 }), g({ name: 'past', targetDate: '2026-01' }), g({ name: 'nodate', targetDate: '' }), g({ name: 'hard', target: 100000, targetDate: '2028-10', monthly: 100 })], (x) => x.saved, TODAY)
  assert.deepEqual(needs.map((n) => n.name), ['a', 'hard'])
  assert.equal(needs[1].stretch, true)
  assert.equal(needs[1].level, 'high')
})

test('ability is calculated from what is known, needs two factors, and a thin buffer caps it', () => {
  const youngStable = abilityFactors({ investor: { birthYear: 1996, incomeStability: 'stable' }, year: 2026, debtShare: 0, dependants: 0 })
  assert.equal(ability(youngStable).level, 'high')
  assert.equal(ability(abilityFactors({ year: 2026, debtShare: 0 })).level, null)
  const thin = abilityFactors({ investor: { birthYear: 1996, incomeStability: 'stable' }, year: 2026, debtShare: 0, dependants: 0, bufferMonths: 1 })
  assert.equal(ability(thin).level, 'medium')
  assert.equal(abilityFactors({ investor: { employment: 'retired' }, year: 2026 })[0].level, 'low')
})

const account = (over: Partial<Account>): Account => ({ id: 'a', name: 'A', type: 'current', institution: '', currency: 'EUR', balance: 0, asOf: TODAY, rate: null, monthly: 0, notes: '', createdAt: '', ...over })
const spend = (date: string, amount: number): Transaction => ({ id: 's' + date, date, direction: 'out', amount, currency: 'EUR', account: 'Current', category: 'Groceries', description: 'x', notes: '', tags: [], documentIds: [], source: 'import', createdAt: '' })

test('inputs come from the Ledger: buffer in months of spending, debt share, dependants, nearest investing goal', () => {
  const accounts = [account({ id: 'c', balance: 6000 }), account({ id: 'd', name: 'Depot', type: 'brokerage', balance: 20000 }), account({ id: 'l', name: 'Loan', type: 'loan', balance: 5000 })]
  const tx = ['2026-08-15', '2026-09-15', '2026-10-15'].map((d) => spend(d, 1000))
  const goals: Goal[] = [
    { id: 'g1', name: 'Home', target: 50000, currency: 'EUR', targetDate: '2031-10', saved: 0, monthly: 300, accountId: 'd', priority: 'high', notes: '', createdAt: '' },
    { id: 'g2', name: 'Emergency fund', target: 10000, currency: 'EUR', targetDate: '2027-06', saved: 3200, monthly: 400, accountId: 'c', priority: 'high', notes: '', createdAt: '' },
    { id: 'g3', name: 'Trip', target: 2500, currency: 'EUR', targetDate: '2027-03', saved: 600, monthly: 150, accountId: '', priority: 'low', notes: '', createdAt: '' },
  ]
  const { ability: a, needs } = ledgerRiskInputs({ transactions: tx, accounts, balances: [], goals, householdMembers: [{ name: 'A', relationship: 'Daughter' }, { name: 'B', relationship: 'Partner' }], today: TODAY })
  assert.ok(Math.abs(a.bufferMonths! - 6) < 0.01, String(a.bufferMonths))
  assert.ok(a.debtShare! > 0.15 && a.debtShare! < 0.25)
  assert.equal(a.dependants, 1)
  assert.equal(a.nearestGoalMonths, 60)
  assert.deepEqual(needs.map((n) => n.name), ['Home'], 'cash goals are met by saving, not by return')
})

test('the three together: say where they disagree, and nothing until two are known', () => {
  assert.equal(togetherNote('high', null, null), '')
  assert.match(togetherNote('low', 'high', 'low'), /comfortable with more risk than your situation/)
  assert.match(togetherNote('high', 'low', 'low'), /could carry more risk than you are comfortable/)
  assert.match(togetherNote('low', 'medium', 'high'), /need more return/)
  assert.match(togetherNote('medium', 'medium', 'medium'), /same way/)
  assert.match(togetherNote('high', 'high', 'high', true), /no plan can count on/)
})
