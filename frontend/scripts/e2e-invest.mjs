// Drives the Invest flows in a real browser against a stateful mock of the Google Sheets API.
// Writes land in the mock sheet, so what the app reads back afterwards is what it saved.
// No real account or data is touched. Usage: node scripts/e2e-invest.mjs [baseUrl]
// Reference numbers were worked out separately in Python (scipy brentq for the yearly rate).
import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:5173'
const user = { id: 'test', email: 'test@example.com', name: 'Asha Verma', picture: '' }
const SHEETS = ['Transactions', 'Documents', 'Accounts', 'Balances', 'Goals', 'Budgets', 'Analysis', 'Profile', 'Trash', 'Meta', 'Plans', 'Holdings', 'Trades']
const txHeader = ['id', 'date', 'direction', 'amount', 'currency', 'account', 'category', 'description', 'notes', 'tags', 'document_ids', 'source', 'created_at', 'account_id']

const tabs = () => ({
  Transactions: [txHeader, ['tx_1', '2026-10-02', 'in', 4200, 'EUR', 'Current', 'Salary', 'ACME', '', '', '', 'manual', '2026-10-02T10:00:00Z', '']],
  Accounts: [
    ['id', 'name', 'type', 'institution', 'currency', 'balance', 'as_of', 'rate', 'monthly', 'notes', 'created_at'],
    ['acc_1', 'Current', 'current', 'Bank', 'EUR', 3000, '2026-10-21', '', '', '', ''],
    ['acc_9', 'Depot', 'brokerage', 'Broker', 'EUR', 18000, '2026-10-01', '', '', '', ''],
    ['acc_10', 'Pension', 'pension', 'Insurer', 'EUR', 9000, '2026-10-01', '', '', '', ''],
  ],
  Balances: [
    ['account_id', 'date', 'balance', 'recorded_at'],
    ['acc_9', '2026-04-01', 14000, ''],
    ['acc_9', '2026-07-01', 16000, ''],
    ['acc_10', '2026-04-01', 8000, ''],
    ['acc_10', '2026-07-01', 8500, ''],
  ],
  Goals: [['id', 'name', 'target', 'currency', 'target_date', 'saved', 'monthly', 'account_id', 'priority', 'notes', 'created_at'], ['goal_9', 'Home deposit', 60000, 'EUR', '2032-06-01', 0, 300, 'acc_9', 'high', '', '']],
  Budgets: [['category', 'monthly', 'currency', 'created_at']],
  Profile: [['key', 'value', 'updated_at'], ['residenceCountries', '["DE"]', ''], ['accountTypes', '["current"]', ''], ['expenseCategories', '["Housing"]', ''], ['investorProfile', JSON.stringify({ birthYear: 1990, employment: 'employed', incomeStability: 'stable' }), '']],
  Plans: [['id', 'name', 'amount', 'currency', 'frequency', 'start_date', 'end_date', 'goal_id', 'account_id', 'notes', 'created_at']],
  Holdings: [['id', 'account_id', 'name', 'isin', 'symbol', 'asset_class', 'quantity', 'avg_cost', 'currency', 'price', 'price_date', 'notes', 'created_at']],
  Trades: [['id', 'holding_id', 'account_id', 'date', 'type', 'quantity', 'price', 'amount', 'fee', 'tax', 'currency', 'notes', 'created_at']],
})

const failures = []
const check = (ok, what, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && extra ? ` -> ${extra}` : ''}`)
  if (!ok) failures.push(what)
}
const approx = (a, b, tol = 0.0006) => Math.abs(Number(a) - b) <= tol

async function session(browser, viewport = { width: 1280, height: 900 }) {
  const data = tabs()
  const writes = []
  const ctx = await browser.newContext({ viewport })
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
    const path = url.pathname
    const method = req.method()
    let body = null
    try { body = JSON.parse(req.postData() || 'null') } catch { /* not json */ }
    const rangeOf = (s) => {
      const [tab, range = ''] = decodeURIComponent(s).split('!')
      return { tab, range }
    }
    // read
    let m = /\/values\/([^:?]+)$/.exec(path)
    if (method === 'GET' && m) {
      const { tab, range } = rangeOf(m[1])
      const rows = data[tab] ?? [[]]
      const cell = /^A(\d+)$/.exec(range)
      if (cell) return r.fulfill({ json: { values: rows[Number(cell[1]) - 1] ? [[rows[Number(cell[1]) - 1][0]]] : [] } })
      if (range === 'A:A') return r.fulfill({ json: { values: rows.map((x) => [x[0]]) } })
      return r.fulfill({ json: { values: rows } })
    }
    if (method === 'GET') return r.fulfill({ json: { spreadsheetId: 'L1', sheets: SHEETS.map((title, i) => ({ properties: { sheetId: i, title } })) } })
    // append
    m = /\/values\/([^:?]+):append$/.exec(path)
    if (method === 'POST' && m) {
      const { tab } = rangeOf(m[1])
      data[tab] = data[tab] ?? [[]]
      data[tab].push(...body.values)
      writes.push({ kind: 'append', tab, rows: body.values })
      return r.fulfill({ json: { updates: {} } })
    }
    // update one row
    m = /\/values\/([^:?]+)$/.exec(path)
    if (method === 'PUT' && m) {
      const { tab, range } = rangeOf(m[1])
      const row = Number(/^A(\d+)/.exec(range)?.[1])
      if (data[tab] && row) data[tab][row - 1] = body.values[0]
      writes.push({ kind: 'update', tab, row, values: body.values[0] })
      return r.fulfill({ json: { updatedRows: 1 } })
    }
    // delete rows
    if (method === 'POST' && /:batchUpdate$/.test(path) && body?.requests) {
      for (const q of body.requests) {
        const d = q.deleteDimension?.range
        if (d) {
          const tab = SHEETS[d.sheetId]
          data[tab].splice(d.startIndex, d.endIndex - d.startIndex)
          writes.push({ kind: 'delete', tab, from: d.startIndex, to: d.endIndex })
        }
      }
      return r.fulfill({ json: { replies: [] } })
    }
    return r.fulfill({ json: { replies: [], updates: {} } })
  })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date('2026-10-23T10:00:00Z'))
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) console.log('  [console error]', m.text().slice(0, 160))
  })
  return { page, ctx, writes, data }
}

const profileOf = (data) => {
  const row = data.Profile.find((r) => r[0] === 'investorProfile')
  return row ? JSON.parse(row[1]) : null
}
const text = (page) => page.locator('main').innerText()

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }))

// ---------------------------------------------------------------- 1. tabs, overview and expert mode
{
  const { page, ctx } = await session(browser)
  await page.goto(`${base}/invest`, { waitUntil: 'networkidle' })
  let t = await text(page)
  check(/WORTH NOW/i.test(t) && /27\.000,00/.test(t), 'overview: worth now adds the depot and the pension (27.000,00)')
  check(/PUT IN/i.test(t) && /PLANNED EACH MONTH/i.test(t), 'overview: put in and planned tiles are shown')
  check((await page.getByText('Worth over time').count()) > 0, 'overview: the worth-over-time chart is shown (balance history exists)')
  check(await page.locator('svg[role="img"]').count() > 0, 'overview: charts have an accessible label')
  await page.getByText('Show as table').first().click()
  check((await page.locator('main table').count()) > 0, 'overview: a chart can be shown as a table')

  for (const [tab, heading] of [['Goals', /Where your goals could land/], ['Mix and holdings', /How it is spread/], ['Plans', /Planned investments/], ['Risk', /Your risk, three ways/], ['About you', /About you/]]) {
    await page.getByRole('navigation', { name: 'Invest sections' }).getByRole('link', { name: tab }).click()
    await page.waitForTimeout(250)
    check(heading.test(await text(page)), `tabs: "${tab}" opens its section`)
  }
  await page.goto(`${base}/invest?tab=nonsense`, { waitUntil: 'networkidle' })
  check(/WORTH NOW/i.test(await text(page)), 'tabs: an unknown tab falls back to the overview')

  await page.goto(`${base}/invest?tab=holdings`, { waitUntil: 'networkidle' })
  check((await page.getByRole('heading', { name: 'Holdings', exact: true }).count()) === 0, 'expert mode: Holdings is hidden while expert mode is off')
  await page.getByRole('switch', { name: 'Expert mode' }).click()
  await page.waitForTimeout(300)
  check((await page.getByRole('heading', { name: 'Holdings', exact: true }).count()) === 1, 'expert mode: Holdings appears after switching it on')
  await page.reload({ waitUntil: 'networkidle' })
  check((await page.getByRole('heading', { name: 'Holdings', exact: true }).count()) === 1, 'expert mode: stays on after a reload (the choice is remembered)')
  await ctx.close()
}

// ---------------------------------------------------------------- 2. holdings, trades and the numbers
{
  const { page, ctx, writes, data } = await session(browser)
  await page.addInitScript(() => localStorage.setItem('aarya.expertMode', '1'))
  await page.goto(`${base}/invest?tab=holdings`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Add holding' }).first().click()
  await page.locator('#hold-name').fill('World equity ETF')
  await page.locator('#hold-isin').fill('IE00B4L5Y98')
  await page.locator('#hold-qty').fill('1')
  await page.getByRole('button', { name: 'Add holding' }).last().click()
  await page.waitForTimeout(400)
  check(/ISIN does not look right/.test(await page.locator('body').innerText()) && !writes.some((w) => w.tab === 'Holdings'), 'holding: a wrong ISIN is refused and nothing is saved')
  await page.locator('#hold-isin').fill('IE00B4L5Y983')
  await page.locator('#hold-price').fill('160')
  await page.getByRole('button', { name: 'Add holding' }).last().click()
  await page.waitForTimeout(900)
  const held = writes.filter((w) => w.kind === 'append' && w.tab === 'Holdings')
  check(held.length === 1 && held[0].rows[0][2] === 'World equity ETF' && held[0].rows[0][3] === 'IE00B4L5Y983', 'holding: saved with name and a valid ISIN')

  const trades = [
    { type: 'buy', date: '2024-01-01', qty: '10', price: '100', fee: '1' },
    { type: 'buy', date: '2024-07-01', qty: '10', price: '120', fee: '1' },
    { type: 'sell', date: '2025-03-01', qty: '5', price: '150', fee: '1', tax: '2' },
    { type: 'dividend', date: '2025-06-01', amount: '20', tax: '3' },
  ]
  await page.locator('summary', { hasText: /Trades/ }).first().click()
  for (const tr of trades) {
    await page.getByRole('button', { name: 'Add trade' }).first().click()
    await page.locator('#trade-type').selectOption(tr.type)
    await page.locator('#trade-date').fill(tr.date)
    if (tr.type === 'dividend') await page.locator('#trade-amount').fill(tr.amount)
    else {
      await page.locator('#trade-qty').fill(tr.qty)
      await page.locator('#trade-price').fill(tr.price)
    }
    if (tr.fee) await page.locator('#trade-fee').fill(tr.fee)
    if (tr.tax) await page.locator('#trade-tax').fill(tr.tax)
    await page.getByRole('button', { name: 'Add trade' }).last().click()
    await page.waitForTimeout(700)
    if (!(await page.locator('summary', { hasText: /Trades/ }).first().evaluate((el) => el.parentElement.open))) await page.locator('summary', { hasText: /Trades/ }).first().click()
  }
  const tradeRows = data.Trades.slice(1)
  check(tradeRows.length === 4, `trades: four trades saved (got ${tradeRows.length})`)
  const holdRow = data.Holdings[1]
  check(holdRow && approx(holdRow[6], 15, 1e-6) && approx(holdRow[7], 110.1, 1e-3), 'trades: units 15 and average cost 110.10 are written back to the holding (Python: 15 and 110.1)', JSON.stringify(holdRow))
  const body = await text(page)
  check(/196,50/.test(body), 'numbers: realised gain 196,50 (Python: 196.5)')
  check(/17,00/.test(body), 'numbers: dividends after tax 17,00')
  check(/\+?18[.,]8%/.test(body), 'numbers: yearly return about 18.8% (Python XIRR: 18.805%)', (body.match(/about [+-]?[\d.,]+% a year[^\n]*/) || [''])[0])
  check(/\+?43[.,]7%|\+?43[.,]6%/.test(body), 'numbers: total gain about 43.7% on 2.202 put in (Python: 962 / 2202)')

  // selling more than is held
  await page.getByRole('button', { name: 'Add trade' }).first().click()
  await page.locator('#trade-type').selectOption('sell')
  await page.locator('#trade-date').fill('2026-10-01')
  await page.locator('#trade-qty').fill('100')
  await page.locator('#trade-price').fill('160')
  await page.getByRole('button', { name: 'Add trade' }).last().click()
  await page.waitForTimeout(800)
  const afterOver = await page.locator('main').evaluate((el) => { el.querySelectorAll('details').forEach((d) => (d.open = true)); return el.innerText })
  check(/larger than the units held/i.test(afterOver), 'oversell: the page warns when a sale is larger than what was held')
  check(Number(data.Holdings[1][6]) >= 0, 'oversell: units never go below zero')

  // delete that trade again and the figures return
  await page.locator('main').evaluate((el) => el.querySelectorAll('details').forEach((d) => (d.open = true)))
  await page.getByRole('button', { name: /Edit Sell of 2026-10-01/ }).click()
  await page.getByRole('button', { name: /^Remove$/ }).click()
  await page.getByRole('button', { name: /^Yes, remove$/ }).click()
  await page.waitForTimeout(900)
  check(data.Trades.length === 5 && approx(data.Holdings[1][6], 15, 1e-6), `delete trade: the row is removed and units return to 15 (rows ${data.Trades.length - 1}, units ${data.Holdings[1][6]})`)

  // selling everything leaves a holding that can still be edited
  await page.getByRole('button', { name: 'Add trade' }).first().click()
  await page.locator('#trade-type').selectOption('sell')
  await page.locator('#trade-date').fill('2026-10-02')
  await page.locator('#trade-qty').fill('15')
  await page.locator('#trade-price').fill('160')
  await page.getByRole('button', { name: 'Add trade' }).last().click()
  await page.waitForTimeout(900)
  check(Number(data.Holdings[1][6]) === 0, 'sell all: units become 0')
  await page.getByRole('button', { name: 'Edit World equity ETF' }).click()
  await page.locator('#hold-notes').fill('sold out')
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await page.waitForTimeout(800)
  check(String(data.Holdings[1][11]) === 'sold out', 'sell all: a fully sold holding can still be edited and saved (notes)', `row: ${JSON.stringify(data.Holdings[1])}`)
  await ctx.close()
}

// ---------------------------------------------------------------- 3. plans, target, risk answers, about you: nothing overwrites anything
{
  const { page, ctx, writes, data } = await session(browser)
  await page.goto(`${base}/invest?tab=plans`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add a plan' }).first().click()
  await page.locator('#plan-name').fill('Monthly investing')
  await page.locator('#plan-amount').fill('300')
  await page.locator('#plan-goal').selectOption({ label: 'Home deposit (60.000,00 €)' }).catch(async () => page.locator('#plan-goal').selectOption({ index: 1 }))
  await page.getByRole('button', { name: 'Add plan' }).last().click()
  await page.waitForTimeout(800)
  check(data.Plans.length === 2 && data.Plans[1][1] === 'Monthly investing' && Number(data.Plans[1][2]) === 300, 'plan: saved with name and amount')
  await page.goto(`${base}/invest`, { waitUntil: 'networkidle' })
  check(/300,00/.test(await text(page)), 'plan: the overview shows 300,00 planned each month')

  // target
  await page.goto(`${base}/invest?tab=holdings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Set a target' }).click()
  await page.locator('#target-funds').fill('60')
  await page.locator('#target-shares').fill('50')
  await page.getByRole('button', { name: 'Save target' }).click()
  await page.waitForTimeout(500)
  check(/add up to 110%/.test(await text(page)), 'target: shares that add up to 110% are refused with a clear message')
  check(profileOf(data)?.allocationTarget === undefined, 'target: nothing was saved while it was wrong')
  await page.locator('#target-shares').fill('40')
  await page.getByRole('button', { name: 'Save target' }).click()
  await page.waitForTimeout(900)
  check(profileOf(data)?.allocationTarget?.funds === 60 && profileOf(data)?.allocationTarget?.shares === 40, 'target: 60/40 saved to the Profile tab')
  check(profileOf(data)?.birthYear === 1990, 'target: saving it kept the answers about you')

  // risk answers
  await page.goto(`${base}/invest?tab=risk`, { waitUntil: 'networkidle' })
  const groups = page.locator('fieldset')
  const n = await groups.count()
  for (let i = 0; i < n; i++) await groups.nth(i).locator('label').nth(1).click()
  await page.getByRole('button', { name: 'Save answers' }).click()
  await page.waitForTimeout(900)
  const p1 = profileOf(data)
  check(n === 6 && Object.keys(p1?.riskAnswers ?? {}).length === 6, `risk: six answers saved (questions ${n})`)
  check(p1?.allocationTarget?.funds === 60 && p1?.birthYear === 1990, 'risk: saving answers kept the target and the answers about you')
  check(/Willingness/.test(await text(page)) && !/Not enough yet[\s\S]*Willingness[\s\S]*Not enough yet/.test(await text(page)), 'risk: willingness shows a level after answering')

  // about you
  await page.goto(`${base}/invest?tab=you`, { waitUntil: 'networkidle' })
  await page.locator('#inv-year').fill('1985')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(900)
  const p2 = profileOf(data)
  check(p2?.birthYear === 1985 && Object.keys(p2?.riskAnswers ?? {}).length === 6 && p2?.allocationTarget?.funds === 60, 'about you: a new year of birth kept the risk answers and the target')
  await page.locator('#inv-year').fill('1850')
  check(/between 1900/.test(await text(page)) && await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), 'about you: an impossible year is refused and Save is disabled')
  await page.getByRole('button', { name: 'Clear my answers' }).click().catch(() => {})
  await page.waitForTimeout(900)
  const p3 = profileOf(data)
  check(Object.keys(p3?.riskAnswers ?? {}).length === 6 && p3?.allocationTarget?.funds === 60, 'about you: "Clear my answers" clears only the personal answers, not the risk answers or the target')

  // adviser pack
  await page.goto(`${base}/invest/review`, { waitUntil: 'networkidle' })
  const pack = await text(page)
  check(/Adviser pack/.test(pack) && /Questions to take to an adviser/.test(pack) && /not regulated advice/i.test(pack), 'adviser pack: sections and the notice are present')
  check(/Home deposit/.test(pack) && /Monthly investing/.test(pack), 'adviser pack: shows the goal and the plan just added')
  check((await page.getByRole('button', { name: /Print or save as PDF/ }).count()) === 1, 'adviser pack: has the print button')
  check(/Ability to take losses/.test(pack) && /Comfort with losses/.test(pack), 'adviser pack: risk in three parts')
  await ctx.close()
}

// ---------------------------------------------------------------- 4. phone layout
{
  const { page, ctx } = await session(browser, { width: 390, height: 844 })
  await page.goto(`${base}/invest`, { waitUntil: 'networkidle' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow <= 1, `phone: the Invest overview does not scroll sideways (overflow ${overflow}px)`)
  await page.goto(`${base}/invest/review`, { waitUntil: 'networkidle' })
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow2 <= 1, `phone: the adviser pack does not scroll sideways (overflow ${overflow2}px)`)
  await ctx.close()
}

// ---------------------------------------------------------------- 5. empty ledger
{
  const { page, ctx, data } = await session(browser)
  data.Accounts = [data.Accounts[0], data.Accounts[1]]
  data.Goals = [data.Goals[0]]
  data.Balances = [data.Balances[0]]
  await page.goto(`${base}/invest`, { waitUntil: 'networkidle' })
  check(/Nothing to show yet/.test(await text(page)), 'empty: without an investment account the overview says what to do')
  await page.goto(`${base}/invest/review`, { waitUntil: 'networkidle' })
  check(/What is missing/.test(await text(page)), 'empty: the adviser pack still opens and says what is missing')
  await ctx.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
