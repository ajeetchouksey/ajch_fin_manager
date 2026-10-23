// Screenshots signed-in pages with a fake session and a fictional Ledger served from mocked Google APIs.
// No real account or data is touched. Usage:
//   node scripts/shot-pages.mjs <baseUrl> <outDir> <path>[,<path>...] [dark|light|both] [desktop|phone|both]
import { chromium } from 'playwright'

const [base = 'http://localhost:5173', outDir = '.', pathsArg = '/dashboard', themesArg = 'both', sizesArg = 'desktop'] = process.argv.slice(2)
const paths = pathsArg.split(',')
const themes = themesArg === 'both' ? ['dark', 'light'] : [themesArg]
const sizes = { desktop: { width: Number(process.env.SHOT_WIDTH || 1280), height: 900 }, phone: { width: 390, height: 844 } }
const sizeNames = sizesArg === 'both' ? ['desktop', 'phone'] : [sizesArg]
const user = { id: 'test', email: 'test@example.com', name: 'Asha Verma', picture: '' }

// ---- fictional ledger: four months of a typical household ----
let n = 0
const tx = (date, direction, amount, category, description) => [`tx_${++n}`, date, direction, amount, 'EUR', 'Current account', category, description, '', '', '', 'import', `${date}T10:00:00Z`, '']
const rows = []
for (const [m, extraRent] of [['07', false], ['08', true], ['09', false], ['10', false]]) {
  rows.push(tx(`2026-${m}-28`, 'in', 4200, 'Salary', 'ACME GmbH Gehalt'))
  rows.push(tx(`2026-${m}-01`, 'out', 1350.49, 'Housing', 'Miete Wohnung'))
  if (extraRent) rows.push(tx(`2026-${m}-29`, 'out', 1350.49, 'Housing', 'Miete Wohnung'))
  rows.push(tx(`2026-${m}-03`, 'out', 89.5 + Number(m), 'Groceries', 'REWE Markt'))
  rows.push(tx(`2026-${m}-12`, 'out', 64.2, 'Groceries', 'Lidl'))
  rows.push(tx(`2026-${m}-05`, 'out', 49.9, 'Fitness', 'RSG Group'))
  rows.push(tx(`2026-${m}-06`, 'out', 13.99, 'Subscriptions', 'Netflix'))
  rows.push(tx(`2026-${m}-07`, 'out', 55, 'Utilities', 'Stadtwerke Strom'))
  rows.push(tx(`2026-${m}-09`, 'out', 29.99, 'Mobile & internet', 'Telekom'))
  rows.push(tx(`2026-${m}-15`, 'out', 49 + Number(m) * 3, 'Transport', 'Deutsche Bahn'))
  rows.push(tx(`2026-${m}-18`, 'out', 32.5, 'Dining out', 'Pizzeria'))
  rows.push(tx(`2026-${m}-20`, 'out', 500, 'Transfer', 'Tagesgeld'))
}
rows.push(tx('2026-09-22', 'out', 210, 'Travel', 'Booking.com'))
rows.push(tx('2026-10-21', 'out', 18.4, 'Other', 'Kiosk'))
const header = ['id', 'date', 'direction', 'amount', 'currency', 'account', 'category', 'description', 'notes', 'tags', 'document_ids', 'source', 'created_at', 'account_id']
const tabs = {
  Transactions: [header, ...rows],
  Budgets: [['category', 'monthly', 'currency', 'created_at'], ['Groceries', 200, 'EUR', ''], ['Dining out', 60, 'EUR', ''], ['Transport', 60, 'EUR', '']],
  Accounts: [
    ['id', 'name', 'type', 'institution', 'currency', 'balance', 'as_of', 'rate', 'monthly', 'notes', 'created_at'],
    ['acc_1', 'Current account', 'current', 'Example Bank', 'EUR', 8420.55, '2026-10-21', '', '', '', ''],
    ['acc_2', 'Tagesgeld', 'savings', 'Example Bank', 'EUR', 15000, '2026-10-01', 2.5, 500, '', ''],
  ],
  Documents: [
    ['id', 'title', 'type', 'date', 'notes', 'tags', 'transaction_ids', 'file_name', 'mime_type', 'link', 'uploaded_at'],
    ['doc_1', 'October statement', 'Bank statement', '2026-10-21', '48 transactions imported.', '', '', 'statement-oct.csv', 'text/csv', 'https://example.com', '2026-10-21T10:00:00Z'],
    ['doc_2', 'October statement', 'Bank statement', '2026-10-21', 'Same file as above.', '', '', 'statement-oct.csv', 'text/csv', 'https://example.com', '2026-10-21T10:05:00Z'],
    ['doc_3', 'REWE receipt', 'Receipt', '2026-10-03', '', '', '', 'IMG_6613.jpg', 'image/jpeg', 'https://example.com', '2026-10-03T18:00:00Z'],
  ],
  Profile: [['key', 'value', 'updated_at'], ['residenceCountries', '["DE"]', ''], ['accountTypes', '["current"]', ''], ['expenseCategories', '["Housing","Groceries"]', '']],
}
// SHOT_GOALS=1 adds two goals, to see the page with goals instead of the empty state
if (process.env.SHOT_GOALS) {
  tabs.Goals = [
    ['id', 'name', 'target', 'currency', 'target_date', 'saved', 'monthly', 'account_id', 'priority', 'notes', 'created_at'],
    ['goal_1', 'Emergency fund', 10000, 'EUR', '2027-06-01', 3200, 400, '', 'high', '', ''],
    ['goal_2', 'Family trip', 2500, 'EUR', '2027-03-01', 600, 150, '', 'medium', '', ''],
  ]
}
// SHOT_INVEST=1 adds a depot with a goal linked to it, a child in the household, and optional Invest answers
if (process.env.SHOT_INVEST) {
  tabs.Accounts.push(['acc_9', 'Depot', 'brokerage', 'Example Broker', 'EUR', 18000, '2026-10-21', 5, 300, '', ''])
  tabs.Goals = tabs.Goals ?? [['id', 'name', 'target', 'currency', 'target_date', 'saved', 'monthly', 'account_id', 'priority', 'notes', 'created_at']]
  tabs.Goals.push(['goal_9', 'Home deposit', 60000, 'EUR', '2032-06-01', 0, 300, 'acc_9', 'high', '', ''])
  tabs.Profile.push(['householdMembers', '[{"name":"Mia","relationship":"Daughter"}]', ''])
  if (process.env.SHOT_INVEST === '2') {
    tabs.Plans = [['id', 'name', 'amount', 'currency', 'frequency', 'start_date', 'end_date', 'goal_id', 'account_id', 'notes', 'created_at'],
      ['plan_1', 'Monthly investing', 300, 'EUR', 'monthly', '', '', 'goal_9', 'acc_9', '', ''],
      ['plan_2', 'Bonus top-up', 1200, 'EUR', 'yearly', '2027-03-01', '', 'goal_9', '', '', ''],
      ['plan_3', 'Course fund', 150, 'EUR', 'monthly', '2025-01-01', '2026-06-30', '', '', '', '']]
    tabs.Profile.push(['investorProfile', JSON.stringify({ birthYear: 1990, employment: 'employed', incomeStability: 'stable', riskAnswers: { fall: 2, range: 2, feeling: 3, wait: 3, 'never-below': 2 } }), ''])
  }
}
// SHOT_INR=1 adds an INR account and payments plus a typed rate, for the second-currency views (SHOT_NORATE=1 leaves the rate out)
if (process.env.SHOT_INR) {
  const inr = (date, direction, amount, category, description) => [`tx_i${++n}`, date, direction, amount, 'INR', 'Indian account', category, description, '', '', '', 'import', `${date}T10:00:00Z`, '']
  tabs.Transactions.push(inr('2026-10-02', 'in', 36000, 'Other income', 'Interest'), inr('2026-10-09', 'out', 18000, 'Housing', 'Family support'), inr('2026-10-14', 'out', 4200, 'Groceries', 'Local market'))
  tabs.Accounts.push(['acc_3', 'Indian account', 'current', 'Example Bank India', 'INR', 540000, '2026-10-21', '', '', '', ''])
  if (!process.env.SHOT_NORATE) tabs.Profile.push(['exchangeRate', '{"base":"EUR","quote":"INR","rate":90}', ''])
}
// SHOT_NOPROFILE=1 starts without a profile, so the first-time setup opens
if (process.env.SHOT_NOPROFILE) tabs.Profile = [['key', 'value', 'updated_at']]
// SHOT_NOBUDGETS=1 shows Budgets before any limit is set
if (process.env.SHOT_NOBUDGETS && tabs.Budgets) tabs.Budgets = tabs.Budgets.slice(0, 1)
const SHEETS = ['Transactions', 'Documents', 'Accounts', 'Balances', 'Goals', 'Budgets', 'Analysis', 'Profile', 'Trash', 'Meta']

async function mock(ctx) {
  await ctx.route('https://www.googleapis.com/oauth2/**', (r) => r.fulfill({ json: user }))
  await ctx.route('https://www.googleapis.com/drive/**', (r) => r.fulfill({ json: { files: [{ id: 'L1', name: 'Ledger', webViewLink: '', parents: ['F1'] }] } }))
  await ctx.route('https://sheets.googleapis.com/**', (r) => {
    const url = new URL(r.request().url())
    const m = /\/values\/([^/:?]+)/.exec(url.pathname)
    if (r.request().method() === 'GET' && m) {
      const tab = decodeURIComponent(m[1]).split('!')[0]
      return r.fulfill({ json: { values: tabs[tab] ?? [[]] } })
    }
    if (r.request().method() === 'GET') return r.fulfill({ json: { spreadsheetId: 'L1', sheets: SHEETS.map((title, i) => ({ properties: { sheetId: i, title } })) } })
    return r.fulfill({ json: {} })
  })
}

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }))
for (const size of sizeNames) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: sizes[size], isMobile: size === 'phone', hasTouch: size === 'phone' })
    await ctx.addInitScript(([t, u, hide]) => {
      localStorage.setItem('aarya.theme', t)
      if (hide) localStorage.setItem('aarya.hideAmounts', '1')
      localStorage.setItem('authData', JSON.stringify({ accessToken: 'fake', user: u }))
      // This device "linked Drive before": a stored Ledger location and a fresh Drive token
      localStorage.setItem(`aarya.ledger.${u.id}`, JSON.stringify({ folderId: 'F1', folderName: 'AaryaAI Finance', folderLink: '', documentsFolderId: 'F1', spreadsheetId: 'L1', spreadsheetLink: '' }))
      sessionStorage.setItem('aarya.driveToken', JSON.stringify({ accessToken: 'fake-drive', expiresAt: Date.now() + 3600_000 }))
    }, [theme, user, !!process.env.SHOT_HIDE])
    await mock(ctx)
    const page = await ctx.newPage()
    for (const p of paths) {
      await page.goto(base + p, { waitUntil: 'networkidle' })
      await page.waitForTimeout(Number(process.env.SHOT_WAIT || 900))
      const name = p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'
      await page.screenshot({ path: `${outDir}/${name}-${size}-${theme}.png`, fullPage: true, animations: 'disabled' })
      // SHOT_FILE=<csv> loads a file into the first file input; SHOT_CLICKS=a,b clicks buttons by name; a shot after each
      const steps = [...(process.env.SHOT_FILE ? ['@file'] : []), ...(process.env.SHOT_CLICKS ? process.env.SHOT_CLICKS.split(',') : [])]
      for (const [i, step] of steps.entries()) {
        if (step === '@file') await page.locator('input[type=file]').first().setInputFiles(process.env.SHOT_FILE)
        else await page.getByRole('button', { name: step, exact: true }).or(page.getByRole('radio', { name: step, exact: true })).or(page.getByRole('switch', { name: step, exact: true })).filter({ visible: true }).first().click()
        await page.waitForTimeout(Number(process.env.SHOT_WAIT || 900))
        await page.screenshot({ path: `${outDir}/${name}-${i + 1}-${size}-${theme}.png`, fullPage: true, animations: 'disabled' })
      }
    }
    await ctx.close()
  }
}
await browser.close()
console.log('ok')
