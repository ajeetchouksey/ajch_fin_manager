// Drives the write paths in a real browser against a mocked Google API and prints what would have been sent.
// No real account or data is touched. Usage: node scripts/e2e-writes.mjs [baseUrl]
import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:5173'
const user = { id: 'test', email: 'test@example.com', name: 'Asha Verma', picture: '' }
const SHEETS = ['Transactions', 'Documents', 'Accounts', 'Balances', 'Goals', 'Budgets', 'Analysis', 'Profile', 'Trash', 'Meta']
const txHeader = ['id', 'date', 'direction', 'amount', 'currency', 'account', 'category', 'description', 'notes', 'tags', 'document_ids', 'source', 'created_at', 'account_id']
const t = (id, date, dir, amount, cur, cat, desc) => [id, date, dir, amount, cur, 'Main', cat, desc, '', '', '', 'manual', `${date}T10:00:00Z`, '']

const tabs = () => ({
  Transactions: [txHeader, t('tx_1', '2026-10-02', 'in', 4200, 'EUR', 'Salary', 'ACME Gehalt'), t('tx_2', '2026-10-05', 'out', 50, 'EUR', 'Groceries', 'REWE'), t('tx_3', '2026-10-06', 'in', 36000, 'INR', 'Other income', 'Interest')],
  Accounts: [['id', 'name', 'type', 'institution', 'currency', 'balance', 'as_of', 'rate', 'monthly', 'notes', 'created_at'], ['acc_1', 'Main', 'current', 'Bank', 'EUR', 1000, '2026-10-21', '', '', '', '']],
  Goals: [['id', 'name', 'target', 'currency', 'target_date', 'saved', 'monthly', 'account_id', 'priority', 'notes', 'created_at'], ['goal_1', 'Trip', 2500, 'EUR', '2027-03-01', 600, 150, '', 'medium', '', '']],
  Budgets: [['category', 'monthly', 'currency', 'created_at'], ['Groceries', 200, 'EUR', '']],
  Profile: [['key', 'value', 'updated_at'], ['residenceCountries', '["DE"]', ''], ['accountTypes', '["current"]', ''], ['expenseCategories', '["Housing","Groceries"]', '']],
})

const failures = []
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`)
  if (!ok) failures.push(what)
}

async function session(browser) {
  const data = tabs()
  const writes = []
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((u) => {
    localStorage.setItem('aarya.theme', 'dark')
    localStorage.setItem('authData', JSON.stringify({ accessToken: 'fake', user: u }))
    localStorage.setItem(`aarya.ledger.${u.id}`, JSON.stringify({ folderId: 'F1', folderName: 'AaryaAI Finance', folderLink: '', documentsFolderId: 'F1', spreadsheetId: 'L1', spreadsheetLink: '' }))
    sessionStorage.setItem('aarya.driveToken', JSON.stringify({ accessToken: 'fake-drive', expiresAt: Date.now() + 3600_000 }))
  }, user)
  await ctx.route('https://www.googleapis.com/oauth2/**', (r) => r.fulfill({ json: user }))
  await ctx.route('https://www.googleapis.com/drive/**', (r) => r.fulfill({ json: { files: [{ id: 'L1', name: 'Ledger', webViewLink: '', parents: ['F1'] }] } }))
  await ctx.route('https://sheets.googleapis.com/**', (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const m = /\/values\/([^/:?]+)/.exec(url.pathname)
    if (req.method() === 'GET' && m) {
      const [tab, range = ''] = decodeURIComponent(m[1]).split('!')
      const rows = data[tab] ?? [[]]
      const cell = /^A(\d+)$/.exec(range)
      if (cell) return r.fulfill({ json: { values: rows[Number(cell[1]) - 1] ? [[rows[Number(cell[1]) - 1][0]]] : [] } })
      if (range === 'A:A') return r.fulfill({ json: { values: rows.map((x) => [x[0]]) } })
      return r.fulfill({ json: { values: rows } })
    }
    if (req.method() === 'GET') return r.fulfill({ json: { spreadsheetId: 'L1', sheets: SHEETS.map((title, i) => ({ properties: { sheetId: i, title } })) } })
    let body = null
    try { body = JSON.parse(req.postData() || 'null') } catch { /* not json */ }
    writes.push({ method: req.method(), path: url.pathname.replace(/^.*\/L1/, ''), body })
    return r.fulfill({ json: { replies: [], updates: {} } })
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
  return { page, ctx, writes }
}

const appended = (writes, tab) => writes.filter((w) => w.path.includes(`${tab}!`) && w.body?.values).flatMap((w) => w.body.values)
const deleted = (writes) => writes.filter((w) => w.path.endsWith(':batchUpdate')).flatMap((w) => (w.body?.requests ?? []).filter((q) => q.deleteDimension))

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }))

// 1. Split a 63.00 bill into 40.00 + 23.00
{
  const { page, ctx, writes } = await session(browser)
  await page.goto(`${base}/transactions?add=1`, { waitUntil: 'networkidle' })
  await page.locator('#tx-amount').fill('63')
  await page.locator('#tx-desc').fill('Split test shop')
  await page.getByRole('switch', { name: 'Split across categories' }).click()
  await page.getByLabel('Category for part 1').selectOption('Groceries')
  await page.getByLabel('Amount for part 1').fill('40')
  await page.getByLabel('Category for part 2').selectOption({ index: 2 })
  await page.getByLabel('Amount for part 2').fill('20')
  check(await page.getByText('left to assign').count() > 0, 'split: shows what is left to assign (3.00)')
  await page.getByRole('contentinfo').getByRole('button', { name: 'Add transaction', exact: true }).click()
  await page.waitForTimeout(600)
  check(appended(writes, 'Transactions').length === 0, 'split: nothing is saved while the parts do not add up')
  await page.getByLabel('Amount for part 2').fill('23')
  check(await page.getByText('Splits add up to').count() > 0, 'split: shows the checkmark when the parts add up')
  await page.getByRole('contentinfo').getByRole('button', { name: 'Add transaction', exact: true }).click()
  await page.waitForTimeout(1500)
  const rows = appended(writes, 'Transactions')
  check(rows.length === 2, `split: two transactions appended (got ${rows.length})`)
  check(rows.length === 2 && Math.abs(rows.reduce((n, r) => n + Number(r[3]), 0) - 63) < 0.005, 'split: the parts add up to 63.00')
  check(rows.every((r) => r[7] === 'Split test shop' && r[2] === 'out'), 'split: same payee, money out')
  check(rows.length === 2 && /Split 1 of 2/.test(rows[0][8]) && /Split 2 of 2/.test(rows[1][8]), 'split: notes say Split 1 of 2 and 2 of 2')
  await ctx.close()
}

// 2. Delete all data
{
  const { page, ctx, writes } = await session(browser)
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Delete all data', exact: true }).click()
  const confirm = page.getByRole('button', { name: 'Delete all data', exact: true }).last()
  check(await confirm.isDisabled(), 'delete all: confirm is disabled until DELETE is typed')
  await page.getByLabel(/Type DELETE/).fill('delete')
  check(await confirm.isEnabled(), 'delete all: confirm is enabled once DELETE is typed')
  await confirm.click()
  await page.waitForTimeout(1800)
  const trashed = appended(writes, 'Trash')
  check(trashed.length === 4, `delete all: 3 transactions + 1 account go to Trash first (got ${trashed.length})`)
  const firstTrash = writes.findIndex((w) => w.path.includes('Trash!'))
  const firstDelete = writes.findIndex((w) => w.path.endsWith(':batchUpdate'))
  check(firstTrash >= 0 && firstDelete > firstTrash, 'delete all: Trash is written before any row is removed')
  const removed = deleted(writes)
  check(removed.length === 3 + 1 + 1 + 1, `delete all: 6 rows removed (3 transactions, 1 account, 1 goal, 1 budget; got ${removed.length})`)
  await ctx.close()
}

// 3. Exchange rate
{
  const { page, ctx, writes } = await session(browser)
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
  const save = page.getByRole('button', { name: 'Save rate' })
  check(await save.isDisabled(), 'rate: Save is disabled while empty')
  await page.getByLabel(/Rate: how many/).fill('90,5')
  await save.click()
  await page.waitForTimeout(1200)
  if (process.env.E2E_DEBUG) console.log(JSON.stringify(writes, null, 1))
  const profile = appended(writes, 'Profile').map((r) => r.join('|')).join('\n')
  check(/exchangeRate/.test(profile) && /"rate":90\.5/.test(profile), 'rate: saved to the Profile tab as 90.5 (comma accepted)')
  await ctx.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
