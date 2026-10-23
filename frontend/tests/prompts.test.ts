import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_PROMPTS, PROMPT_GROUPS, promptText } from '../src/lib/ledger/prompts.ts'

test('prompts have unique ids and belong to a known group', () => {
  const ids = new Set(AI_PROMPTS.map((p) => p.id))
  assert.equal(ids.size, AI_PROMPTS.length)
  const groups = new Set(PROMPT_GROUPS.map((g) => g.id))
  for (const p of AI_PROMPTS) {
    assert.ok(groups.has(p.group), p.id)
    assert.ok(p.title && p.when && p.body, p.id)
  }
  for (const g of PROMPT_GROUPS) assert.ok(AI_PROMPTS.some((p) => p.group === g.id), g.id)
})

test('the connected version reads the Ledger, the plain version asks the person', () => {
  const p = AI_PROMPTS[0]
  const connected = promptText(p, true)
  const plain = promptText(p, false)
  assert.match(connected, /FinBuddy tools/)
  assert.doesNotMatch(plain, /FinBuddy tools/)
  assert.match(plain, /ask me for the figures/)
  for (const text of [connected, plain]) {
    assert.ok(text.includes(p.body))
    assert.match(text, /not regulated advice/)
    assert.match(text, /Do not name or recommend specific products/)
    assert.match(text, /decide for myself/)
  }
})

test('prompts carry no personal figures', () => {
  for (const p of AI_PROMPTS) {
    assert.doesNotMatch(promptText(p, true), /\d{4,}/, p.id)
    assert.doesNotMatch(promptText(p, true), /@/, p.id)
  }
})
