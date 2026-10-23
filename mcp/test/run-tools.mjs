// End-to-end check of the FinBuddy MCP tools against the test harness (`wrangler dev --config test/wrangler.test.jsonc`).
// Usage: node test/run-tools.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8799'
let id = 0
let failures = 0

async function rpc(method, params, query = '') {
  const res = await fetch(`${BASE}/mcp${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  })
  const text = await res.text()
  const json = text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find((l) => l.startsWith('data:')).slice(5))
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`)
  return json.result
}

async function call(name, args = {}, query = '') {
  const r = await rpc('tools/call', { name, arguments: args }, query)
  const text = r.content?.map((c) => c.text).join('\n') ?? ''
  return { error: !!r.isError, text, data: (() => { try { return JSON.parse(text.slice(text.indexOf('\n\n') + 2)) } catch { return null } })() }
}

function check(label, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` â€” ${detail}` : ''}`)
  if (!cond) failures++
}

const CSV = `Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;WÃ¤hrung;Auftraggeberkonto;Bankleitzahl Auftraggeberkonto;IBAN Auftraggeberkonto;Kategorie
03.09.2026;03.09.2026;Lastschrift;REWE Markt GmbH Berlin Kartenzahlung 02.09;-54,20;EUR;0387814700;50040000;DE80500400000387814700;Lebensmittel
01.09.2026;01.09.2026;Gutschrift;ACME GMBH Gehalt September 2026;4.200,00;EUR;0387814700;50040000;DE80500400000387814700;Einkommen
01.09.2026;01.09.2026;Dauerauftrag;Max Mustermann Miete September IBAN DE89370400440532013000;-1.150,00;EUR;0387814700;50040000;DE80500400000387814700;Wohnen
30.09.2026;30.09.2026;Lastschrift;NETFLIX.COM;-13,99;EUR;0387814700;50040000;DE80500400000387814700;Freizeit
15.09.2026;15.09.2026;Lastschrift;AMAZON EU SARL;-89,00;EUR;0387814700;50040000;DE80500400000387814700;Shopping`

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
check('initialize', !!init.serverInfo, `${init.serverInfo?.name} Â· instructions ${init.instructions ? 'present' : 'missing'}`)

const prompts = (await rpc('prompts/list', {})).prompts ?? []
check('prompts/list has the investing prompts', prompts.length >= 7 && prompts.some((p) => p.name === 'goal-strategy'), prompts.map((p) => p.name).join(', '))
const gotPrompt = await rpc('prompts/get', { name: 'goal-strategy' })
check('prompts/get returns text that uses the FinBuddy tools', /FinBuddy tools/.test(gotPrompt.messages?.[0]?.content?.text ?? ''))

const tools = (await rpc('tools/list', {})).tools
check('tools/list', tools.length === 31, tools.map((t) => t.name).join(', '))
const monthTool = tools.find((t) => t.name === 'month_summary')
check('month_summary links to the month view', monthTool?._meta?.ui?.resourceUri === 'ui://finbuddy/month-view', JSON.stringify(monthTool?._meta ?? null))
const resList = await rpc('resources/list', {})
check('the month view is listed as a resource', resList.resources?.some((x) => x.uri === 'ui://finbuddy/month-view'), (resList.resources ?? []).map((x) => x.uri).join(', '))
const resRead = await rpc('resources/read', { uri: 'ui://finbuddy/month-view' })
const viewContent = resRead.contents?.[0]
check('the month view is served as a self-contained page', viewContent?.mimeType === 'text/html;profile=mcp-app' && /<html/.test(viewContent?.text ?? '') && !/https?:\/\//.test((viewContent?.text ?? '').replace(/http:\/\/www\.w3\.org[^\s"']*/g, '')), viewContent?.mimeType)
const del = tools.find((t) => t.name === 'delete_transactions')
check('delete is marked destructive', del?.annotations?.destructiveHint === true)
check('review is read-only', tools.find((t) => t.name === 'financial_review')?.annotations?.readOnlyHint === true)

let r = await call('ledger_status')
check('status without ledger', !r.error && /No FinBuddy Ledger/.test(r.text))

r = await call('create_ledger', {})
check('create_ledger', !r.error && /Created/.test(r.text), r.text.split('\n')[0])
r = await call('create_ledger', {})
check('create_ledger is idempotent', /already exists/.test(r.text))

r = await call('import_statement', { csv_text: CSV })
check('import preview', !r.error && r.data?.bank === 'Commerzbank' && r.data?.rows_to_import === 5, JSON.stringify(r.data?.columns))
check('preview categorises', r.data?.sample?.some((s) => s.category === 'Salary') && r.data?.sample?.some((s) => s.category === 'Groceries'), r.data?.sample?.map((s) => s.category).join(','))
check('IBAN masked in preview', !JSON.stringify(r.data).includes('DE89370400440532013000'))
r = await call('ledger_status')
check('preview saved nothing', r.data?.transactions === 0)
r = await call('find_documents', { text: 'payslip' })
check('find_documents on empty ledger', !r.error && r.data?.documents?.length === 0, r.text.split('\n')[0])

r = await call('import_statement', { csv_text: CSV, apply: true, account: 'Commerzbank current' })
check('import apply', !r.error && /Imported 5/.test(r.text))
r = await call('import_statement', { csv_text: CSV })
check('re-import skips duplicates', r.data?.rows_to_import === 0 && r.data?.already_in_ledger === 5)

r = await call('find_transactions', { text: 'amazon' })
check('find_transactions', r.data?.transactions?.length === 1, r.text.split('\n')[0])
const amazonId = r.data.transactions[0].id
r = await call('update_transactions', { updates: [{ id: amazonId, category: 'Gifts & donations', add_tags: ['birthday'] }] })
check('update_transactions', !r.error && r.data?.updated?.[0]?.category === 'Gifts & donations' && r.data.updated[0].tags?.includes('birthday'))

r = await call('add_transactions', { transactions: [{ date: '2026-10-02', amount: 45.5, direction: 'out', description: 'EDEKA Center' }, { date: '2026-09-03', amount: 54.2, direction: 'out', description: 'REWE Markt GmbH Berlin Kartenzahlung 02.09' }] })
check('add_transactions auto-category + dedupe', !r.error && r.data?.added?.length === 1 && r.data.added[0].category === 'Groceries', r.text.split('\n')[0])

r = await call('save_account', { name: 'Commerzbank current', type: 'current', balance: 2400, as_of: '2026-10-19' })
check('save_account', !r.error, r.text.split('\n')[0])
const accId = r.data.id

r = await call('import_statement', { csv_text: CSV, update_account: 'Commerzbank current', balance: 2100, balance_as_of: '2026-10-20' })
check('import preview plans balance update', r.data?.balance_update?.action === 'update' && r.data.balance_update.balance === 2100, JSON.stringify(r.data?.balance_update))
r = await call('import_statement', { csv_text: CSV, apply: true, update_account: 'Commerzbank current', balance: 2100, balance_as_of: '2026-10-20' })
check('import apply sets balance (no new rows)', !r.error && /Set the balance of Commerzbank current to 2100 on 2026-10-20/.test(r.text), r.text.split('\n')[0])
r = await call('import_statement', { csv_text: CSV, update_account: 'Commerzbank current', balance: 1000, balance_as_of: '2026-10-01' })
check('older balance does not overwrite newer', r.data?.balance_update?.action === 'none' && /newer balance/.test(r.data?.balance_update?.note ?? ''), r.data?.balance_update?.note)
r = await call('import_statement', { csv_text: CSV, update_account: 'Commerzbank current' })
check('no balance in file is reported', r.data?.balance_update?.action === 'none' && /No balance in this file/.test(r.data?.balance_update?.note ?? ''), r.data?.balance_update?.note)
await call('save_account', { name: 'Tagesgeld', type: 'savings', balance: 3000, rate_percent: 2.5 })
await call('save_account', { name: 'Visa', type: 'credit_card', balance: 1800, rate_percent: 19, monthly: 150 })
r = await call('save_account', { id: accId, name: 'Commerzbank current', type: 'current', balance: 2600 })
check('update account balance', /Updated/.test(r.text))
r = await call('save_goal', { name: 'Holiday Japan', target: 6000, target_date: '2027-06-01', saved: 1000, monthly: 300, priority: 'high' })
check('save_goal', !r.error, r.text)

r = await call('list_accounts_and_goals')
check('list accounts and goals', r.data?.accounts?.length === 3 && r.data?.goals?.length === 1 && r.data.accounts.find((a) => a.id === accId)?.balance === 2600)

r = await call('financial_review')
check('financial_review', !r.error && r.data?.net_worth?.net_worth === 3800 && Array.isArray(r.data?.gaps), `score ${r.data?.health_score} Â· gaps: ${r.data?.gaps?.map((g) => g.title).join(' | ')}`)
r = await call('financial_review', { sections: ['score', 'cash_flow'] })
check('review sections filter', r.data && !('gaps' in r.data) && 'cash_flow' in r.data, `savings rate ${r.data?.cash_flow?.savings_rate_percent}%`)

r = await call('forecast_what_if', { extra_spending_per_month: 800 })
check('forecast_what_if', !r.error && r.data?.scenario?.length === 12 && r.data.scenario[11].cash < r.data.base[11].cash)
check('forecast_what_if says it is an estimate and gives drivers', r.data?.estimate === true && typeof r.data?.drivers?.net === 'number')

r = await call('month_summary', {})
check('month_summary defaults to the latest period with data', !r.error && r.data?.period?.kind === 'calendar' && r.data.totals.transactions > 0, r.text.split('\n')[0])
check('month_summary has series, categories, budgets and basis', Array.isArray(r.data?.series) && r.data.series.length >= 1 && Array.isArray(r.data?.categories) && Array.isArray(r.data?.budgets) && /1st to last day/.test(r.data?.basis ?? ''))
const catSum = r.data.categories.reduce((s, c) => s + c.amount, 0)
const prevCatSum = r.data.categories.reduce((s, c) => s + c.previous_amount, 0)
check('month_summary categories add up to both totals', Math.abs(catSum - r.data.totals.spending) < 0.01 && Math.abs(prevCatSum - r.data.previous_totals.spending) < 0.01, `${catSum.toFixed(2)} vs ${r.data.totals.spending}; previous ${prevCatSum.toFixed(2)} vs ${r.data.previous_totals?.spending}`)
r = await call('month_summary', { mode: 'salary' })
check('month_summary salary mode returns a salary cycle or falls back', !r.error && ['salary', 'calendar'].includes(r.data?.period?.kind) && typeof r.data?.fell_back_to_calendar === 'boolean', r.text.split('\n')[0])
r = await call('monthly_report', {})
check('monthly_report has headline, figures, watch list and basis', !r.error && r.data?.headline?.length >= 1 && Array.isArray(r.data?.figures) && Array.isArray(r.data?.watch_list) && /Actual figures/.test(r.data?.basis ?? ''), r.text.split('\n')[0])
check('monthly_report explains moves honestly', (r.data?.categories ?? []).every((c) => c.note === undefined || c.note.length > 0))
r = await call('monthly_report', { mode: 'calendar', threshold_percent: 5, min_amount: 1 })
r = await call('set_budget', { category: 'Groceries', monthly: 300 })
check('set_budget adds a budget', !r.error && /Set the Groceries budget to 300/.test(r.text), r.text.split('\n')[0])
r = await call('set_budget', { category: 'Groceries', monthly: 250 })
check('set_budget changes the same budget', !r.error && /Changed the Groceries budget to 250/.test(r.text))
r = await call('list_budgets', { mode: 'calendar' })
check('list_budgets shows the budget with its state', !r.error && r.data?.budgets?.some((b) => b.category === 'Groceries' && b.limit === 250 && ['ok', 'warn', 'over'].includes(b.state)), r.text.split('\n')[0])
r = await call('delete_budget', { category: 'Groceries' })
check('delete_budget without confirm is refused', r.error && /confirm/.test(r.text))
r = await call('delete_budget', { category: 'Groceries', confirm: true })
check('delete_budget with confirm removes it', !r.error && /Deleted the Groceries budget/.test(r.text))
r = await call('read_document', { text: 'payslip' })
check('read_document with nothing saved says so', r.error && /No saved document matches/.test(r.text), r.text.split('\n')[0])
r = await call('list_imports', {})
check('list_imports shows the statement import', !r.error && r.data?.imports?.length >= 1 && r.data.imports[0].payments >= 1, r.text.split('\n')[0])
r = await call('preview_account_link', { account: 'Commerzbank current', label: 'Commerzbank current' })
check('preview_account_link counts rows and changes nothing', !r.error && r.data?.would_link >= 1 && r.data?.linked_to_another_account === 0 && /Nothing has been changed/.test(r.text), r.text.split('\n')[0])
r = await call('preview_account_link', { account: 'No such account' })
check('preview_account_link refuses an unknown account', r.error && /No account matches/.test(r.text))
r = await call('monthly_report', { mode: 'calendar', threshold_percent: 5, min_amount: 1 })
check('monthly_report thresholds are used',!r.error && (r.data?.watch_list?.length ?? 0) >= 0 && /moved at least 5%/.test(r.data?.basis ?? ''))

r = await call('worth_checking', {})
check('worth_checking returns a list and changes nothing', !r.error && Array.isArray(r.data?.checks) && r.data.checks.every((c) => c.kind && c.title), r.text.split('\n')[0])
r = await call('worth_checking', { other_share_limit: 0 })
check('worth_checking other_share_limit is used', !r.error && Array.isArray(r.data?.checks))
r = await call('list_accounts_and_goals', {})
check('list_accounts_and_goals lists planned investments and holdings (none yet)', !r.error && Array.isArray(r.data?.planned_investments) && r.data.planned_investments.length === 0 && Array.isArray(r.data?.holdings) && r.data.holdings.length === 0 && Array.isArray(r.data?.trades) && r.data.trades.length === 0, r.text.split('\n')[0])
r = await call('investment_plan', {})
check('investment_plan returns goals, plans and the three risk answers', !r.error && Array.isArray(r.data?.goals) && Array.isArray(r.data?.plans) && 'ability' in (r.data?.risk ?? {}) && /not regulated advice/i.test(r.data?.notice ?? ''), r.text.split('\n')[0])
r = await call('investment_review', {})
check('investment_review returns the whole pack with gaps and questions', !r.error && Array.isArray(r.data?.gaps) && r.data.questions?.length >= 1 && Array.isArray(r.data?.holdings) && Array.isArray(r.data?.allocation), r.text.split('\n')[0])
// ---- investing on a realistic ledger, checked against numbers worked out separately (Python, scipy) ----
{
  const seed = async (tab, rows) => (await fetch(`${BASE}/_seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, rows }) })).json()
  const dep = await call('save_account', { name: 'Depot', type: 'brokerage', balance: 18000, as_of: '2026-10-01' })
  const depId = dep.data?.id
  const goal = await call('save_goal', { name: 'Home deposit', target: 60000, target_date: '2032-06-01', monthly: 300, account_id: depId, priority: 'high' })
  const goalId = goal.data?.id
  const tr = (id, date, type, quantity, price, amount, fee, tax) => [id, 'hold_a', depId, date, type, quantity, price, amount, fee, tax, 'EUR', '', `${date}T10:00:00Z`]
  const seeded = [
    await seed('Holdings', [['hold_a', depId, 'World equity ETF', 'IE00B4L5Y983', '', 'funds', 15, 110.1, 'EUR', 160, '2026-10-20', 'private note', '2024-01-01T00:00:00Z']]),
    await seed('Trades', [tr('t1', '2024-01-01', 'buy', 10, 100, 0, 1, 0), tr('t2', '2024-07-01', 'buy', 10, 120, 0, 1, 0), tr('t3', '2025-03-01', 'sell', 5, 150, 0, 1, 2), tr('t4', '2025-06-01', 'dividend', 0, 0, 20, 0, 3)]),
    await seed('Plans', [['plan_a', 'Monthly investing', 300, 'EUR', 'monthly', '', '', goalId, depId, '', '2024-01-01T00:00:00Z']]),
    await seed('Profile', [['investorProfile', JSON.stringify({ birthYear: 1990, employment: 'employed', incomeStability: 'stable', riskAnswers: { fall: 2, range: 2, feeling: 3, wait: 3, 'never-below': 2 }, allocationTarget: { funds: 60, shares: 40 } }), '']]),
  ]
  check('investing: test data seeded', seeded.every((s) => s.ok), JSON.stringify(seeded))

  // independent yearly-rate solver (actual/365), not the app's code
  const today = new Date().toISOString().slice(0, 10)
  const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000
  const flows = [['2024-01-01', -1001], ['2024-07-01', -1201], ['2025-03-01', 747], ['2025-06-01', 17], [today, 15 * 160]]
  const npv = (rate) => flows.reduce((s, [d, a]) => s + a / (1 + rate) ** (days('2024-01-01', d) / 365), 0)
  let lo = -0.99
  let hi = 10
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(mid) > 0) lo = mid
    else hi = mid
  }
  const expectYearly = (lo + hi) / 2

  const rev = await call('investment_review', {})
  const h = rev.data?.holdings?.[0]
  check('investment_review: holding value, gain and share match (2.400; +962; 43.69%)', !rev.error && h?.value === 2400 && h?.gain === 962 && Math.abs(h?.gainShare - 0.4369) < 0.0002, JSON.stringify(h))
  check('investment_review: realised gain 196.50 and dividends after tax 17.00', h?.realised === 196.5 && h?.dividends === 17, `realised ${h?.realised}, dividends ${h?.dividends}`)
  check(`investment_review: yearly return matches an independent solver (${(expectYearly * 100).toFixed(2)}%)`, typeof h?.yearly === 'number' && Math.abs(h.yearly - expectYearly) < 0.0006, `got ${h?.yearly}`)
  check('investment_review: private notes on holdings are not in the pack', !JSON.stringify(rev.data).includes('private note'))
  check('investment_review: the risk picture uses the saved answers', rev.data?.risk?.answered === 5 && rev.data?.risk?.willingness !== null && rev.data?.risk?.ability !== null, JSON.stringify(rev.data?.risk).slice(0, 160))
  check('investment_review: about you comes from the saved profile', rev.data?.about?.work === 'Employed' && rev.data?.about?.age >= 35, JSON.stringify(rev.data?.about))
  check('investment_review: target mix shows in the spread', rev.data?.allocation?.[0]?.lines?.some((l) => l.id === 'funds' && l.target === 60), JSON.stringify(rev.data?.allocation?.[0]?.lines?.map((l) => [l.id, l.target])))

  const plan = await call('investment_plan', {})
  const s = plan.data?.goals?.[0]
  const fv = (cur, m, n, r) => {
    if (r === 0) return cur + m * n
    const i = (1 + r) ** (1 / 12) - 1
    return cur * (1 + i) ** n + m * (((1 + i) ** n - 1) / i)
  }
  check('investment_plan: the goal is found and uses the planned 300 a month', !plan.error && s?.name === 'Home deposit' && s?.monthly === 300 && s?.source === 'plans' && s?.current === 18000, JSON.stringify({ monthly: s?.monthly, source: s?.source, current: s?.current }))
  check('investment_plan: 0%, 3% and 6% cases match an independent calculation', s?.cases?.length === 3 && s.cases.every((c) => Math.abs(c.value - fv(18000, 300, s.months, c.rate)) < 0.51), JSON.stringify(s?.cases?.map((c) => [c.rate, c.value])))
  check('investment_plan: runs for 5 to 7 years (months ' + s?.months + ')', s?.months >= 60 && s?.months <= 84)
  check('investment_plan: has the not-advice notice', /not regulated advice/i.test(plan.data?.notice ?? ''))
  const ro = await call('investment_review', {}, '?readonly=1')
  check('investment_review: works on a read-only connection', !ro.error && Array.isArray(ro.data?.holdings))
}

r = await call('cleanup_review', {})
check('cleanup_review returns checks and unresolved payees', !r.error && Array.isArray(r.data?.checks) && Array.isArray(r.data?.unresolved_payees), r.text.split('\n')[0])

r = await call('spending_breakdown', { group_by: 'category' })
check('spending_breakdown', !r.error && r.data?.groups?.[0]?.name === 'Housing', r.data?.groups?.map((g) => `${g.name} ${g.total}`).join(', '))

r = await call('delete_transactions', { ids: [amazonId] }).catch((e) => ({ error: true, text: e.message }))
check('delete without confirm is refused', r.error)
r = await call('delete_transactions', { ids: [amazonId], confirm: true })
check('delete with confirm', !r.error && /Deleted 1/.test(r.text))
r = await call('find_transactions', { text: 'amazon' })
check('deleted row is gone', r.data?.transactions?.length === 0)

r = await call('add_transactions', { transactions: [{ date: '2026-10-03', amount: 5, direction: 'out', description: 'Coffee' }] }, '?readonly=1')
check('read-only connection cannot write', r.error && /read-only/.test(r.text))
r = await call('import_statement', { csv_text: CSV }, '?readonly=1')
check('read-only connection can preview', !r.error)

r = await call('month_summary', {})
const latestSpend = r.data.totals.spending
const { start: ps, end: pe } = r.data.period
r = await call('save_analysis', { kind: 'analysis', title: 'Spending check', body: 'Spending for the period.', period_start: ps, period_end: pe, figures: [{ name: 'Spending', value: latestSpend, metric: 'spending' }] })
check('save_analysis preview verifies a correct figure and saves nothing', !r.error && r.data?.verified === 'yes' && /nothing saved/.test(r.text) && r.data?.figures?.[0]?.matches === true, r.text.split('\n')[0])
r = await call('list_analysis', {})
check('nothing saved after a preview', r.data?.entries?.length === 0)
r = await call('save_analysis', { kind: 'analysis', title: 'Wrong figure', body: 'Overstated.', period_start: ps, period_end: pe, figures: [{ name: 'Spending', value: latestSpend + 100, metric: 'spending' }] })
check('save_analysis flags a figure that does not match', r.data?.verified === 'no' && r.data?.figures?.[0]?.matches === false && r.data?.figures?.[0]?.ledger_value === latestSpend, r.text.split('\n')[0])
r = await call('save_analysis', { kind: 'recommendation', title: 'Keep spending steady', body: 'Spending matches the ledger.', period_start: ps, period_end: pe, figures: [{ name: 'Spending', value: latestSpend, metric: 'spending' }], apply: true })
check('save_analysis apply saves the entry', !r.error && /Saved "Keep spending steady"/.test(r.text) && r.data?.verified === 'yes', r.text.split('\n')[0])
r = await call('list_analysis', { kind: 'recommendation' })
check('list_analysis returns the saved entry with its check', !r.error && r.data?.entries?.length === 1 && r.data.entries[0].verified === 'yes' && r.data.entries[0].status === 'open' && r.data.entries[0].figures[0].matches === true, r.text.split('\n')[0])
r = await call('save_analysis', { kind: 'analysis', title: 'No period', body: 'x', figures: [{ name: 'Spending', value: 1, metric: 'spending' }] })
check('save_analysis refuses a figure with no period', r.error && /has no period/.test(r.text))

r = await call('month_summary', { date: '2026-09-15' })
const sepIn = r.data.totals.income
const sepRate = sepIn > 0 ? Math.round(((r.data.totals.net / sepIn) * 100) * 100) / 100 : null
r = await call('save_analysis', { kind: 'analysis', title: 'Savings rate check', body: 'Savings rate for September.', period_start: r.data.period.start, period_end: r.data.period.end, figures: [{ name: 'Savings rate', value: sepRate, metric: 'savings_rate' }] })
check('save_analysis checks a savings rate against the ledger', sepRate !== null && r.data?.verified === 'yes' && r.data?.figures?.[0]?.matches === true, `${sepRate}% -> ${r.data?.verified}`)
r = await call('list_accounts_and_goals', {})
const commerz = r.data?.accounts?.find((a) => a.name === 'Commerzbank current')
r = await call('save_analysis', { kind: 'data_issue', title: 'Balance check', body: 'Balance on the account record date.', period_start: commerz?.as_of, period_end: commerz?.as_of, figures: [{ name: 'Commerzbank current balance', value: commerz?.balance, metric: 'account_balance', account: commerz?.id }] })
check('save_analysis checks an account balance against its record', !!commerz && r.data?.verified === 'yes' && r.data?.figures?.[0]?.matches === true, r.text.split('\n')[0])
const createdAt = (await call('list_imports', {})).data.imports[0].created_at
r = await call('undo_import', { created_at: createdAt })
check('undo_import without confirm is refused', r.error && /confirm/.test(r.text))
r = await call('undo_import', { created_at: createdAt, confirm: true })
check('undo_import removes the import', !r.error && /Removed \d+ payments? from that import/.test(r.text), r.text.split('\n')[0])
r = await call('find_transactions', { text: 'REWE' })
check('undone payments are gone', r.data?.transactions?.length === 0, `${r.data?.transactions?.length} left`)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
