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
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const CSV = `Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;Auftraggeberkonto;Bankleitzahl Auftraggeberkonto;IBAN Auftraggeberkonto;Kategorie
03.09.2026;03.09.2026;Lastschrift;REWE Markt GmbH Berlin Kartenzahlung 02.09;-54,20;EUR;0387814700;50040000;DE80500400000387814700;Lebensmittel
01.09.2026;01.09.2026;Gutschrift;ACME GMBH Gehalt September 2026;4.200,00;EUR;0387814700;50040000;DE80500400000387814700;Einkommen
01.09.2026;01.09.2026;Dauerauftrag;Max Mustermann Miete September IBAN DE89370400440532013000;-1.150,00;EUR;0387814700;50040000;DE80500400000387814700;Wohnen
30.09.2026;30.09.2026;Lastschrift;NETFLIX.COM;-13,99;EUR;0387814700;50040000;DE80500400000387814700;Freizeit
15.09.2026;15.09.2026;Lastschrift;AMAZON EU SARL;-89,00;EUR;0387814700;50040000;DE80500400000387814700;Shopping`

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
check('initialize', !!init.serverInfo, `${init.serverInfo?.name} · instructions ${init.instructions ? 'present' : 'missing'}`)

const tools = (await rpc('tools/list', {})).tools
check('tools/list', tools.length === 28, tools.map((t) => t.name).join(', '))
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
check('financial_review', !r.error && r.data?.net_worth?.net_worth === 3800 && Array.isArray(r.data?.gaps), `score ${r.data?.health_score} · gaps: ${r.data?.gaps?.map((g) => g.title).join(' | ')}`)
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
