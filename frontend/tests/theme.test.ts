import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { DEFAULT_CHOICE, parseChoice, resolveTheme } from '../src/lib/theme.ts'
import { categoryCssVars } from '../src/lib/ledger/categoryColors.ts'

test('dark stays the default; unknown values fall back to it', () => {
  assert.equal(DEFAULT_CHOICE, 'dark')
  assert.equal(parseChoice(null), 'dark')
  assert.equal(parseChoice('blue'), 'dark')
  assert.equal(parseChoice('light'), 'light')
  assert.equal(parseChoice('system'), 'system')
})

test('System follows the device setting', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('the light theme defines every category colour with its light value', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const light = css.slice(css.indexOf(":root[data-theme='light'] {"))
  for (const [name, value] of Object.entries(categoryCssVars('light'))) {
    assert.ok(light.includes(`${name}: ${value};`), `${name} missing or different in the light theme`)
  }
})

test('white text and white washes only where they stay white in both themes', () => {
  // text-white is allowed only next to a solid fill; otherwise use text-ink, bg-wash/N, border-wash/N
  const grep = (p: string) => {
    try {
      return execSync(`git grep -n -e "${p}" -- "src/*.tsx" "src/*.ts"`, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)
    } catch {
      return [] // git grep exits 1 when nothing matches
    }
  }
  const badText = grep('text-white').filter((l) => !/bg-brand(?![/\w-])|bg-brand-strong|bg-red-500|bg-rose-500/.test(l))
  assert.deepEqual(badText, [])
  assert.deepEqual(grep('bg-white/'), [])
  assert.deepEqual(grep('border-white/'), [])
})
