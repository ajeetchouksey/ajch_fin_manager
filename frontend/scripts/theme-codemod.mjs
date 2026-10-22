// One-off: make hard-coded dark-theme colours theme-aware.
// text-white -> text-ink (except on solid brand/red fills), bg-white/N -> bg-wash/N, border-white/N -> border-wash/N.
// Each occurrence is judged by its own class list: the text between the nearest quote/brace on either side.
// Usage: node scripts/theme-codemod.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dry = process.argv.includes('--dry')
const SOLID = /(^|\s)(bg-brand|bg-brand-strong|bg-red-500(\/\d+)?|bg-rose-500(\/\d+)?|bg-panel|bg-good)(?=\s|$)/
const DELIM = /['"`{}]/

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx|ts)$/.test(n) ? [p] : []
  })
}

function classList(src, at) {
  let a = at
  while (a > 0 && !DELIM.test(src[a - 1])) a--
  let b = at
  while (b < src.length && !DELIM.test(src[b])) b++
  return src.slice(a, b)
}

let total = 0
for (const f of files('src')) {
  const src = readFileSync(f, 'utf8')
  let n = 0
  const out = src.replace(/(?<=^|[\s'"`])((?:[\w-]+:)*)(text-white|bg-white\/|border-white\/)(?![\w-])/gm, (m, variants, token, offset) => {
    if (token === 'text-white' && !variants && SOLID.test(classList(src, offset))) return m
    n++
    return variants + token.replace('text-white', 'text-ink').replace('bg-white/', 'bg-wash/').replace('border-white/', 'border-wash/')
  })
  if (n) {
    total += n
    console.log(`${f}: ${n}`)
    if (!dry) writeFileSync(f, out)
  }
}
console.log(`changed ${total}`)
