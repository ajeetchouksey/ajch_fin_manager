import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveServerProfileToLedger } from '../src/lib/profileMigration.ts'
import type { UserSchemaDefinition } from '../src/types/index.ts'

const server: UserSchemaDefinition = {
  residenceCountries: ['DE'],
  accountTypes: ['current'],
  expenseCategories: ['Groceries'],
  householdMembers: [{ name: 'Partner', relationship: 'spouse' }],
}

/** A fake server: records calls, answers the schema read and the delete. */
function fakeServer(schema: UserSchemaDefinition | null, deleteOk = true) {
  const calls: string[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url.replace('https://api.test', '')}`)
    if (url.endsWith('/current-schema')) return new Response(JSON.stringify({ schema }), { status: 200 })
    if (url.endsWith('/reset')) return new Response('{}', { status: deleteOk ? 200 : 500 })
    return new Response('', { status: 404 })
  }) as typeof fetch
  return { calls, fetchImpl }
}

test('no server profile: nothing is saved and nothing is deleted', async () => {
  const s = fakeServer(null)
  let saved = 0
  const r = await moveServerProfileToLedger({ apiUrl: 'https://api.test', token: 't', fetchImpl: s.fetchImpl, saveToLedger: async (p) => (saved++, p) })
  assert.equal(r, 'none')
  assert.equal(saved, 0)
  assert.deepEqual(s.calls, ['GET /api/onboarding/current-schema'])
})

test('a matching read-back moves the profile and deletes the server copy', async () => {
  const s = fakeServer(server)
  const r = await moveServerProfileToLedger({ apiUrl: 'https://api.test', token: 't', fetchImpl: s.fetchImpl, saveToLedger: async (p) => structuredClone(p) })
  assert.equal(r, 'moved')
  assert.deepEqual(s.calls, ['GET /api/onboarding/current-schema', 'POST /api/onboarding/reset'])
})

test('a read-back that differs keeps the server copy', async () => {
  const s = fakeServer(server)
  const r = await moveServerProfileToLedger({ apiUrl: 'https://api.test', token: 't', fetchImpl: s.fetchImpl, saveToLedger: async (p) => ({ ...p, householdMembers: [] }) })
  assert.equal(r, 'kept')
  assert.ok(!s.calls.some((c) => c.includes('/reset')), 'no delete when the copy does not match')
})

test('a failed delete is reported as kept, not moved', async () => {
  const s = fakeServer(server, false)
  const r = await moveServerProfileToLedger({ apiUrl: 'https://api.test', token: 't', fetchImpl: s.fetchImpl, saveToLedger: async (p) => p })
  assert.equal(r, 'kept')
})

test('a server error reading the profile changes nothing', async () => {
  const fetchImpl = (async () => new Response('', { status: 500 })) as typeof fetch
  let saved = 0
  const r = await moveServerProfileToLedger({ apiUrl: 'https://api.test', token: 't', fetchImpl, saveToLedger: async (p) => (saved++, p) })
  assert.equal(r, 'none')
  assert.equal(saved, 0)
})
