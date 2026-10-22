// Screenshots the signed-in shell (sidebar / tab bar) with a fake session and mocked Google APIs.
// No real account or data is used. Usage: node scripts/shot-shell.mjs [baseUrl] [outDir]
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5173'
const outDir = process.argv[3] ?? '.'
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }))
const user = { id: 'test', email: 'test@example.com', name: 'Asha Verma', picture: '' }

const shots = [
  { name: 'desktop', viewport: { width: 1280, height: 820 }, path: '/settings' },
  { name: 'phone', viewport: { width: 390, height: 780 }, path: '/settings', isMobile: true },
]
for (const s of shots) {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: s.viewport, isMobile: !!s.isMobile, hasTouch: !!s.isMobile })
    await ctx.addInitScript(([t, u]) => {
      localStorage.setItem('aarya.theme', t)
      localStorage.setItem('authData', JSON.stringify({ accessToken: 'fake', user: u }))
    }, [theme, user])
    await ctx.route('https://www.googleapis.com/oauth2/**', (r) => r.fulfill({ json: user }))
    await ctx.route(/googleapis\.com\/(drive|upload|v4)|sheets\.googleapis\.com/, (r) => r.fulfill({ json: { files: [] } }))
    const page = await ctx.newPage()
    await page.goto(base + s.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${outDir}/shell-${s.name}-${theme}.png` })
    if (s.name === 'phone' && theme === 'light') {
      await page.getByRole('button', { name: 'Account menu' }).click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${outDir}/shell-phone-menu.png` })
    }
    await ctx.close()
  }
}
await browser.close()
console.log('ok')
