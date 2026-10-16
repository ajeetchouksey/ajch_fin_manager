/**
 * The shared library (src/lib) is used by both the web app and the AI connector, so it must not depend on
 * the app: no imports from outside src/lib, and no UI packages. This keeps the figures the same in both.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib')
const UI_PACKAGES = ['react', 'react-dom', 'react-router-dom', 'lucide-react']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

function importsOf(source: string): string[] {
  const specs: string[] = []
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specs.push(m[1])
  for (const m of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1])
  return specs
}

test('the shared library imports nothing from the app', () => {
  const problems: string[] = []
  for (const file of files(LIB)) {
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) continue
      const target = resolve(dirname(file), spec)
      if (target !== LIB && !target.startsWith(LIB + sep)) problems.push(`${relative(LIB, file)} imports ${spec}`)
    }
  }
  assert.deepEqual(problems, [])
})

test('the shared library uses no UI packages', () => {
  const problems: string[] = []
  for (const file of files(LIB)) {
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      const pkg = spec.split('/')[0]
      if (UI_PACKAGES.includes(pkg)) problems.push(`${relative(LIB, file)} imports ${spec}`)
    }
  }
  assert.deepEqual(problems, [])
})
