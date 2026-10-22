// Screenshots a page in both themes. Usage: node scripts/shot-themes.mjs [url] [outPrefix]
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173/login'
const out = process.argv[3] ?? 'theme-shot'
// Use the installed Edge or Chrome, so no browser download is needed
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }))
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await ctx.addInitScript((t) => localStorage.setItem('aarya.theme', t), theme)
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}-${theme}.png` })
  await ctx.close()
}
await browser.close()
console.log('ok')
