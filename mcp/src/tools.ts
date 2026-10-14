/**
 * The tools the user's AI app can call. Every figure comes from the same code as the web app
 * (statement reader, categoriser, review engine), so the AI explains numbers rather than inventing them.
 */

import { McpServer } from '@modelcontextprotocol/server'
import { getMcpAuthContext } from 'agents/mcp'
import { z } from 'zod'
import { analyzeTable, findCsvBalance, parseCsv, type DateFormat } from '../../frontend/src/lib/ledger/csv'
import { TRANSFER_CATEGORY, isTransfer, learnFromLedger, payeeKey, suggestCategory } from '../../frontend/src/lib/ledger/categorize'
import { matchToLedger, DEFAULT_MATCH_DAYS } from '../../frontend/src/lib/ledger/reconcile'
import { statementRow, type Sign, type TransactionDraft } from '../../frontend/src/lib/ledger/statement'
import { dedupeKey, INCOME_CATEGORIES, MORE_EXPENSE_CATEGORIES, parseTags, todayIso, type Transaction } from '../../frontend/src/lib/ledger/types'
import { ACCOUNT_TYPES, accountType } from '../../frontend/src/lib/ledger/portfolio'
import { DEFAULT_CATEGORIES } from '../../frontend/src/components/setup/options'
import { baseCurrency, forecast, review, type ReviewInput } from '../../frontend/src/lib/analysis/engine'
import { ym } from '../../frontend/src/lib/ledger/summary'
import { explain, LedgerSession } from './ledger'
import { SCOPE_WRITE, type AccessProps } from './types'

const SPENDING_CATEGORIES = Array.from(new Set([...DEFAULT_CATEGORIES, ...MORE_EXPENSE_CATEGORIES, 'Other']))
const CATEGORY_HELP = `Spending: ${SPENDING_CATEGORIES.join(', ')}. Income: ${INCOME_CATEGORIES.join(', ')}. Between own accounts: ${TRANSFER_CATEGORY}. The user's own categories are fine too.`
const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((t) => t.value) as [string, ...string[]]

const INSTRUCTIONS = `FinBuddy is the user's personal finance Ledger: a Google Sheet in their own Google Drive, also used by the FinBuddy web app.
- Start with ledger_status. Use financial_review for "how am I doing", gaps, forecasts and advice; use find_transactions and spending_breakdown for questions about payments.
- Numbers come from FinBuddy's own calculations. Quote them; do not recompute or invent figures.
- To import a bank statement (CSV text from an attached file), call import_statement with apply=false first, show the user the preview, then call it again with apply=true. For PDFs or photos, read the rows yourself and use add_transactions.
- Documents the user saved to FinBuddy (statements, payslips, tax documents, receipts) are listed by find_documents. Look there first when the user asks for a file; say so plainly if nothing matches, and give the link when one is found.
- Amounts are always positive; "direction" says money in or out. Transfers between the user's own accounts use the category "${TRANSFER_CATEGORY}".
- Ask the user before deleting anything. Recommendations are general guidance, not regulated financial advice.`

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const month = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM')
const money = (n: number) => Math.round(n * 100) / 100

/** Keeps IBANs and card numbers out of what is sent back to the AI app. */
function mask(text: string): string {
  return text
    .replace(/\b([A-Z]{2}\d{2})(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, (m, cc) => `${cc}…${m.replace(/\s/g, '').slice(-4)}`)
    .replace(/\b\d(?:[ -]?\d){11,18}\b/g, (m) => `…${m.replace(/\D/g, '').slice(-4)}`)
}

const ok = (summary: string, data?: unknown) => ({
  content: [{ type: 'text' as const, text: data === undefined ? summary : `${summary}\n\n${JSON.stringify(data, null, 1)}` }],
})
const fail = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] })

function props(): AccessProps {
  const p = getMcpAuthContext()?.props as AccessProps | undefined
  if (!p?.googleAccessToken) throw new Error('Not signed in. Reconnect FinBuddy in your AI app.')
  return p
}

const canWrite = () => (props().scope ?? []).includes(SCOPE_WRITE)
const READ_ONLY = 'FinBuddy is connected read-only. To make changes, the user can disconnect and connect again with "Make changes" ticked.'

function txOut(t: Transaction) {
  return {
    id: t.id,
    date: t.date,
    direction: t.direction,
    amount: t.amount,
    currency: t.currency,
    category: t.category,
    description: mask(t.description),
    account: t.account || undefined,
    notes: t.notes ? mask(t.notes) : undefined,
    tags: t.tags.length ? t.tags : undefined,
  }
}

const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }

/** One MCP server per request (stateless), bound to the signed-in user's Google token. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: 'FinBuddy', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  let session: LedgerSession | null = null
  const ledger = () => (session ??= new LedgerSession(props().googleAccessToken))

  /** Runs a tool body and turns Drive/Ledger errors into a message the AI can relay. */
  const run = async <T,>(write: boolean, body: (l: LedgerSession) => Promise<T>) => {
    try {
      if (write && !canWrite()) return fail(READ_ONLY)
      return (await body(ledger())) as T
    } catch (error) {
      return fail(explain(error))
    }
  }

  const reviewInput = async (currency?: string): Promise<ReviewInput> => {
    const d = await ledger().load()
    return { transactions: d.transactions, accounts: d.accounts, balances: d.balances, goals: d.goals, today: todayIso(), currency }
  }

  // ------------------------------------------------------------------ status

  server.registerTool(
    'ledger_status',
    {
      title: 'Ledger status',
      description: 'Where the user\'s FinBuddy Ledger is and what it holds (counts, date range, currencies). Call this first.',
      annotations: RO,
    },
    () =>
      run(false, async (l) => {
        const loc = await l.location()
        const p = props()
        if (!loc) return ok(`Signed in as ${p.email}. No FinBuddy Ledger exists in this Drive yet. Offer to create one with create_ledger.`)
        const d = await l.load()
        const dates = d.transactions.map((t) => t.date).sort()
        return ok(`Signed in as ${p.email}. ${canWrite() ? 'Can read and make changes.' : 'Read-only connection.'}`, {
          ledger: loc.spreadsheetLink,
          folder: loc.folderLink || undefined,
          transactions: d.transactions.length,
          firstDate: dates[0],
          lastDate: dates[dates.length - 1],
          currencies: Array.from(new Set(d.transactions.map((t) => t.currency))),
          accounts: d.accounts.length,
          goals: d.goals.length,
        })
      }),
  )

  server.registerTool(
    'create_ledger',
    {
      title: 'Create Ledger',
      description: 'Create the FinBuddy folder and Ledger Sheet in the user\'s Google Drive. Only needed when ledger_status says there is none; does nothing if one exists.',
      inputSchema: z.object({ folder_name: z.string().max(80).default('AaryaAI Finance').describe('Name of the Drive folder') }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ folder_name }) =>
      run(true, async (l) => {
        const existing = await l.location()
        const loc = existing ?? (await l.create(folder_name))
        return ok(existing ? 'A Ledger already exists; nothing was created.' : 'Created the FinBuddy Ledger in Google Drive.', { ledger: loc.spreadsheetLink })
      }),
  )

  // ------------------------------------------------------------------ analysis

  server.registerTool(
    'financial_review',
    {
      title: 'Financial review',
      description:
        'Full review computed by FinBuddy: health score, net worth, cash flow and savings rate, regular payments, goals, 12-month forecast, and gaps with next steps (emergency fund, debt, retirement, insurance, goals, spending). Use for "how am I doing", recommendations, gaps and planning.',
      inputSchema: z.object({
        currency: z.string().length(3).optional().describe('Currency to analyse; default is the one used most'),
        sections: z
          .array(z.enum(['score', 'net_worth', 'cash_flow', 'recurring', 'goals', 'forecast', 'gaps']))
          .optional()
          .describe('Only these parts; default all'),
      }),
      annotations: RO,
    },
    ({ currency, sections }) =>
      run(false, async () => {
        const r = review(await reviewInput(currency))
        const want = (s: string) => !sections?.length || sections.includes(s as never)
        const out: Record<string, unknown> = { currency: r.currency, as_of: todayIso() }
        if (want('score')) out.health_score = r.score ?? 'not enough data yet (needs accounts and one complete month of transactions)'
        if (want('net_worth'))
          out.net_worth = {
            net_worth: r.netWorth.netWorth,
            assets: r.netWorth.assets,
            liabilities: r.netWorth.liabilities,
            cash_in_reach: r.netWorth.liquid,
            by_group: r.netWorth.byGroup,
            investments: r.netWorth.allocation.map((a) => ({ type: a.label, amount: a.amount, share: money(a.share * 100) })),
            not_included_other_currencies: r.netWorth.otherCurrencies.length ? r.netWorth.otherCurrencies : undefined,
          }
        if (want('cash_flow'))
          out.cash_flow = {
            months_used: r.cashFlow.months.map((m) => m.month),
            avg_income: r.cashFlow.avgIncome,
            avg_spending: r.cashFlow.avgSpending,
            avg_essential: r.cashFlow.avgEssential,
            avg_saved_or_invested: r.cashFlow.avgSaved,
            savings_rate_percent: r.cashFlow.savingsRate === null ? null : money(r.cashFlow.savingsRate * 100),
            by_month: r.cashFlow.months,
            top_categories_monthly: r.cashFlow.byCategory.slice(0, 12),
          }
        if (want('recurring'))
          out.regular_payments = r.recurring.filter((x) => !x.lapsed).slice(0, 25).map((x) => ({ name: mask(x.name), category: x.category, direction: x.direction, cadence: x.cadence, amount: x.amount, per_month: x.monthly, next_date: x.nextDate }))
        if (want('goals'))
          out.goals = r.goals.map((g) => ({ id: g.goal.id, name: g.goal.name, status: g.status, saved: g.saved, target: g.goal.target, target_date: g.goal.targetDate || null, monthly: g.goal.monthly, needed_per_month: g.requiredMonthly, reached_in: g.projectedMonth }))
        if (want('forecast'))
          out.forecast = {
            points: r.forecast.points.map((p) => ({ month: p.month, cash: p.liquid, cash_low: p.liquidLow, cash_high: p.liquidHigh, invested: p.invested, debt: p.debt, net_worth: p.netWorth })),
            cash_may_run_out: r.forecast.cashRunsOutMonth,
            assumptions: r.forecast.assumptions,
          }
        if (want('gaps')) out.gaps = r.gaps.map((g) => ({ severity: g.severity, area: g.area, title: g.title, detail: mask(g.detail), next_step: g.action, metric: g.metric }))
        return ok('FinBuddy review (computed from the Ledger). General guidance, not regulated financial advice.', out)
      }),
  )

  server.registerTool(
    'forecast_what_if',
    {
      title: 'What-if forecast',
      description: 'Compare the 12-month forecast with a scenario: save or spend more each month, or a one-off payment or windfall. Use for "can I afford…", "what if I save X".',
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).default(12),
        extra_saving_per_month: z.number().min(0).default(0).describe('Extra moved into savings/investments each month'),
        extra_spending_per_month: z.number().min(0).default(0).describe('Extra spent each month, e.g. higher rent'),
        one_off_amount: z.number().default(0).describe('Negative = a one-off cost, positive = a one-off income'),
        one_off_month: month.optional(),
        currency: z.string().length(3).optional(),
      }),
      annotations: RO,
    },
    (a) =>
      run(false, async () => {
        const input = await reviewInput(a.currency)
        const base = forecast(input, a.months)
        let shift = 0
        let investedShift = 0
        const scenario = base.points.map((p) => {
          shift += -a.extra_saving_per_month - a.extra_spending_per_month + (a.one_off_month === p.month ? a.one_off_amount : 0)
          investedShift += a.extra_saving_per_month
          return { month: p.month, cash: money(p.liquid + shift), cash_low: money(p.liquidLow + shift), net_worth: money(p.netWorth + shift + investedShift) }
        })
        const runsOut = scenario.find((p) => p.cash_low < 0)?.month ?? null
        return ok(`What-if in ${base.currency} (investment growth on the extra saving is not included, to stay cautious).`, {
          base: base.points.map((p) => ({ month: p.month, cash: p.liquid, net_worth: p.netWorth })),
          scenario,
          cash_may_run_out_in_scenario: runsOut,
          assumptions: base.assumptions,
        })
      }),
  )

  // ------------------------------------------------------------------ reading transactions

  server.registerTool(
    'find_transactions',
    {
      title: 'Find transactions',
      description: 'Search transactions by text, date range, category, direction, account or amount. Returns totals and matching rows with their ids (needed to edit or delete).',
      inputSchema: z.object({
        text: z.string().max(100).optional().describe('Matches description, notes, tags, category or account'),
        from: iso.optional(),
        to: iso.optional(),
        category: z.string().optional(),
        direction: z.enum(['in', 'out']).optional(),
        account: z.string().optional(),
        min_amount: z.number().optional(),
        max_amount: z.number().optional(),
        sort: z.enum(['newest', 'oldest', 'largest']).default('newest'),
        limit: z.number().int().min(1).max(500).default(50),
      }),
      annotations: RO,
    },
    (q) =>
      run(false, async (l) => {
        const { transactions } = await l.load()
        const text = q.text?.toLowerCase()
        const hits = transactions.filter(
          (t) =>
            (!text || [t.description, t.notes, t.tags.join(' '), t.category, t.account].join(' ').toLowerCase().includes(text)) &&
            (!q.from || t.date >= q.from) &&
            (!q.to || t.date <= q.to) &&
            (!q.category || t.category.toLowerCase() === q.category.toLowerCase()) &&
            (!q.direction || t.direction === q.direction) &&
            (!q.account || t.account.toLowerCase().includes(q.account.toLowerCase())) &&
            (q.min_amount === undefined || t.amount >= q.min_amount) &&
            (q.max_amount === undefined || t.amount <= q.max_amount),
        )
        hits.sort((a, b) => (q.sort === 'largest' ? b.amount - a.amount : q.sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
        const totals: Record<string, { in: number; out: number }> = {}
        for (const t of hits) {
          totals[t.currency] ??= { in: 0, out: 0 }
          totals[t.currency][t.direction] = money(totals[t.currency][t.direction] + t.amount)
        }
        return ok(`${hits.length} matching transaction${hits.length === 1 ? '' : 's'}${hits.length > q.limit ? `, showing ${q.limit}` : ''}.`, {
          totals,
          transactions: hits.slice(0, q.limit).map(txOut),
        })
      }),
  )

  server.registerTool(
    'find_documents',
    {
      title: 'Find documents',
      description:
        'Search the documents saved in the FinBuddy Ledger (bank statements, payslips, tax documents, receipts, contracts, insurance), by text, type, date or tag. Returns title, type, date, file name and a link to open the file in Google Drive.',
      inputSchema: z.object({
        text: z.string().max(100).optional().describe('Matches title, notes, tags or file name'),
        type: z.string().optional().describe('For example "Payslip", "Bank statement", "Tax document"'),
        from: iso.optional(),
        to: iso.optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: RO,
    },
    (q) =>
      run(false, async (l) => {
        const { documents } = await l.load()
        const text = q.text?.toLowerCase()
        const type = q.type?.toLowerCase()
        const hits = documents
          .filter(
            (d) =>
              (!text || [d.title, d.notes, d.tags.join(' '), d.fileName].join(' ').toLowerCase().includes(text)) &&
              (!type || d.type.toLowerCase() === type) &&
              (!q.from || d.date >= q.from) &&
              (!q.to || d.date <= q.to),
          )
          .sort((a, b) => b.date.localeCompare(a.date))
        return ok(`${hits.length} matching document${hits.length === 1 ? '' : 's'}${hits.length > q.limit ? `, showing ${q.limit}` : ''}.`, {
          documents: hits.slice(0, q.limit).map((d) => ({
            id: d.id,
            title: d.title,
            type: d.type,
            date: d.date || undefined,
            file_name: d.fileName || undefined,
            notes: d.notes ? mask(d.notes) : undefined,
            tags: d.tags.length ? d.tags : undefined,
            linked_transactions: d.transactionIds.length || undefined,
            link: d.link || undefined,
          })),
        })
      }),
  )

  server.registerTool(
    'spending_breakdown',
    {
      title: 'Spending breakdown',
      description: 'Totals grouped by category, month, account or payee for a period. Transfers between own accounts are left out unless asked.',
      inputSchema: z.object({
        group_by: z.enum(['category', 'month', 'account', 'payee']).default('category'),
        direction: z.enum(['in', 'out']).default('out'),
        from: iso.optional(),
        to: iso.optional(),
        currency: z.string().length(3).optional(),
        include_transfers: z.boolean().default(false),
        top: z.number().int().min(1).max(100).default(20),
      }),
      annotations: RO,
    },
    (q) =>
      run(false, async (l) => {
        const d = await l.load()
        const currency = q.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })
        const rows = d.transactions.filter(
          (t) => t.currency === currency && t.direction === q.direction && (q.include_transfers || !isTransfer(t)) && (!q.from || t.date >= q.from) && (!q.to || t.date <= q.to),
        )
        const groups = new Map<string, { total: number; count: number }>()
        for (const t of rows) {
          const key = q.group_by === 'month' ? ym(t.date) : q.group_by === 'account' ? t.account || 'No account' : q.group_by === 'payee' ? payeeKey(t.description) || mask(t.description) : t.category || 'Other'
          const g = groups.get(key) ?? { total: 0, count: 0 }
          g.total += t.amount
          g.count++
          groups.set(key, g)
        }
        const total = rows.reduce((a, t) => a + t.amount, 0)
        const list = [...groups.entries()]
          .map(([name, g]) => ({ name, total: money(g.total), count: g.count, share_percent: total ? money((g.total / total) * 100) : 0 }))
          .sort((a, b) => (q.group_by === 'month' ? a.name.localeCompare(b.name) : b.total - a.total))
        return ok(`${q.direction === 'out' ? 'Spending' : 'Income'} in ${currency} by ${q.group_by}: ${money(total)} across ${rows.length} transactions.`, { groups: list.slice(0, q.top) })
      }),
  )

  server.registerTool(
    'list_accounts_and_goals',
    {
      title: 'Accounts and goals',
      description: 'The user\'s accounts (bank, savings, investments, pension, property, loans, cards, insurance) with balances and ids, and their goals.',
      annotations: RO,
    },
    () =>
      run(false, async (l) => {
        const d = await l.load()
        return ok(`${d.accounts.length} accounts, ${d.goals.length} goals.`, {
          accounts: d.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, kind: accountType(a.type).group, institution: a.institution || undefined, balance: a.balance, currency: a.currency, as_of: a.asOf, rate_percent: a.rate ?? undefined, monthly: a.monthly || undefined, notes: a.notes ? mask(a.notes) : undefined })),
          goals: d.goals.map((g) => ({ id: g.id, name: g.name, target: g.target, currency: g.currency, target_date: g.targetDate || undefined, saved: g.saved, monthly: g.monthly, linked_account: g.accountId || undefined, priority: g.priority })),
        })
      }),
  )

  // ------------------------------------------------------------------ writing transactions

  const txInput = z.object({
    date: iso,
    amount: z.number().positive().describe('Always positive'),
    direction: z.enum(['in', 'out']),
    description: z.string().min(1).max(200).describe('Shop, payee or what it was for'),
    category: z.string().max(60).optional().describe(`Leave empty to let FinBuddy choose. ${CATEGORY_HELP}`),
    currency: z.string().length(3).optional().describe('Defaults to the currency used most'),
    account: z.string().max(80).optional(),
    notes: z.string().max(2000).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
  })

  server.registerTool(
    'add_transactions',
    {
      title: 'Add transactions',
      description: 'Add one or more transactions (up to 200), e.g. from a receipt, a PDF statement the AI has read, or what the user says. Missing categories are chosen automatically; payments already in the Ledger are skipped.',
      inputSchema: z.object({ transactions: z.array(txInput).min(1).max(200), skip_duplicates: z.boolean().default(true) }),
      annotations: WRITE,
    },
    ({ transactions: items, skip_duplicates }) =>
      run(true, async (l) => {
        const d = await l.load()
        const learned = learnFromLedger(d.transactions)
        const fallbackCurrency = baseCurrency({ transactions: d.transactions, accounts: d.accounts })
        const drafts: TransactionDraft[] = items.map((t) => ({
          date: t.date,
          direction: t.direction,
          amount: money(t.amount),
          currency: (t.currency ?? fallbackCurrency).toUpperCase(),
          account: t.account?.trim() ?? '',
          category: t.category?.trim() || suggestCategory(t.description, t.direction, learned)?.category || (t.direction === 'out' ? 'Other' : 'Other income'),
          description: t.description.trim().slice(0, 200),
          notes: t.notes?.trim() ?? '',
          tags: parseTags((t.tags ?? []).join(',')),
        }))
        const matches = skip_duplicates ? matchToLedger(drafts, d.transactions, 0) : []
        const seen = new Set<string>()
        const keep = drafts.filter((t, i) => {
          const k = dedupeKey(t)
          const dup = !!matches[i] || seen.has(k)
          seen.add(k)
          return !(skip_duplicates && dup)
        })
        const added = await l.appendTransactions(keep, 'manual')
        return ok(`Added ${added.length} transaction${added.length === 1 ? '' : 's'}${keep.length < drafts.length ? `; skipped ${drafts.length - keep.length} already in the Ledger` : ''}.`, { added: added.map(txOut) })
      }),
  )

  server.registerTool(
    'import_statement',
    {
      title: 'Import bank statement',
      description:
        'Import a bank statement export (CSV/TSV text, e.g. from Commerzbank, Sparkasse, DKB, ING, N26, HDFC). Columns are recognised automatically and each row is categorised. ALWAYS call with apply=false first and show the preview; call again with apply=true after the user agrees.',
      inputSchema: z.object({
        csv_text: z.string().min(10).max(2_000_000),
        apply: z.boolean().default(false).describe('false = preview only; true = save to the Ledger'),
        account: z.string().max(80).optional().describe('Account name for all rows, e.g. "Commerzbank current"'),
        currency: z.string().length(3).optional().describe('When the file has no currency column'),
        amounts: z.enum(['negative-out', 'positive-out', 'all-out', 'all-in']).default('negative-out').describe('negative-out for bank accounts; positive-out for most credit cards'),
        date_format: z.enum(['auto', 'dmy', 'mdy', 'ymd']).default('auto'),
        skip_already_added: z.boolean().default(true).describe('Skip payments the user already added by hand'),
        update_account: z
          .string()
          .max(80)
          .optional()
          .describe('Account id or name whose balance to set from this statement. A name that does not exist creates the account'),
        balance: z.number().optional().describe('Balance on balance_as_of, when the file shows none or to override the one it shows'),
        balance_as_of: iso.optional().describe('Date of the balance; default is the statement balance date or the latest transaction'),
      }),
      annotations: WRITE,
    },
    (a) =>
      run(a.apply, async (l) => {
        const d = await l.load()
        const table = parseCsv(a.csv_text)
        const analysis = analyzeTable(table)
        if (analysis.map.date === undefined || analysis.map.amount === undefined) {
          return fail('Could not find the date and amount columns in this file. Is it a bank statement export (CSV)?')
        }
        const currency = (a.currency ?? analysis.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase()
        const knownCategories = Array.from(new Set([...SPENDING_CATEGORIES, ...INCOME_CATEGORIES, ...d.transactions.map((t) => t.category)]))
        const rows = table.slice(analysis.firstRow, analysis.firstRow + 5000).map((r) =>
          statementRow(r, analysis.map, {
            dateFormat: a.date_format as DateFormat,
            sign: a.amounts as Sign,
            currency,
            account: a.account ?? '',
            category: '',
            tags: '',
            notes: '',
            learned: learnFromLedger(d.transactions),
            knownCategories,
          }),
        )
        const good = rows.flatMap((r) => (r.ok ? [r.tx] : []))
        const unreadable = rows.length - good.length
        const matches = a.skip_already_added ? matchToLedger(good, d.transactions, DEFAULT_MATCH_DAYS) : []
        const seen = new Set<string>()
        const toImport: TransactionDraft[] = []
        let already = 0
        let repeated = 0
        good.forEach((t, i) => {
          const k = dedupeKey(t)
          if (matches[i]) already++
          else if (seen.has(k)) repeated++
          else toImport.push(t)
          seen.add(k)
        })
        const sum = (dir: 'in' | 'out') => money(toImport.filter((t) => t.direction === dir && t.category !== TRANSFER_CATEGORY).reduce((s, t) => s + t.amount, 0))
        const header = analysis.headerRow >= 0 ? table[analysis.headerRow] : []
        const col = (i: number | undefined) => (i === undefined ? undefined : header[i] ?? `column ${i + 1}`)
        const summary = {
          bank: analysis.bank ?? 'not recognised',
          columns: { date: col(analysis.map.date), amount: col(analysis.map.amount), money_in: col(analysis.map.credit), payee: col(analysis.map.payee), description: col(analysis.map.description), currency: col(analysis.map.currency) },
          rows_to_import: toImport.length,
          already_in_ledger: already,
          repeated_rows: repeated,
          unreadable_rows: unreadable,
          money_in: sum('in'),
          money_out: sum('out'),
          currency,
        }
        // Balance: the one the file shows (or the one given), set on the chosen account
        const found = findCsvBalance(table, analysis)
        const latest = toImport.reduce((m, t) => (t.date > m ? t.date : m), '')
        const value = a.balance ?? found?.balance
        const asOf = a.balance_as_of ?? (a.balance === undefined ? found?.date : undefined) ?? latest ?? todayIso()
        const wanted = a.update_account?.trim()
        const existing = wanted ? d.accounts.find((x) => x.id === wanted || x.name.trim().toLowerCase() === wanted.toLowerCase()) : undefined
        const isDebt = accountType(existing?.type ?? (a.amounts === 'positive-out' ? 'credit_card' : 'current')).group === 'debt'
        let balanceUpdate: { action: 'none' | 'update' | 'create'; account?: string; balance?: number; as_of: string; note?: string } = { action: 'none', as_of: asOf }
        if (wanted && value === undefined) balanceUpdate.note = 'No balance in this file. Pass balance (and balance_as_of) to set one.'
        else if (wanted && value !== undefined) {
          if (value < 0 && !isDebt) balanceUpdate.note = 'A negative balance cannot be kept on a current or savings account, so it was not updated.'
          else if (existing && existing.asOf > asOf) balanceUpdate.note = `${existing.name} already has a newer balance (${existing.balance} on ${existing.asOf}), so it was kept.`
          else balanceUpdate = { action: existing ? 'update' : 'create', account: existing?.name ?? wanted, balance: money(Math.abs(value)), as_of: asOf }
        }
        const withBalance = { ...summary, statement_balance: found, balance_update: balanceUpdate }

        if (!a.apply) {
          return ok('Preview only, nothing saved. Show this to the user; if they agree, call import_statement again with apply=true and the same options.', {
            ...withBalance,
            sample: toImport.slice(0, 25).map((t) => ({ date: t.date, direction: t.direction, amount: t.amount, category: t.category, description: mask(t.description) })),
          })
        }
        const added = toImport.length ? await l.appendTransactions(toImport, 'import') : []
        if (balanceUpdate.action !== 'none' && balanceUpdate.balance !== undefined) {
          const draft = {
            name: existing?.name ?? wanted!.slice(0, 80),
            type: existing?.type ?? (a.amounts === 'positive-out' ? 'credit_card' : 'current'),
            institution: existing?.institution ?? '',
            currency: existing?.currency ?? currency,
            balance: balanceUpdate.balance,
            asOf,
            rate: existing?.rate ?? null,
            monthly: existing?.monthly ?? 0,
            notes: existing?.notes ?? 'Created from a statement import',
          }
          const saved = await l.saveAccount(draft, existing)
          return ok(`Imported ${added.length} transactions into the Ledger. ${balanceUpdate.action === 'create' ? 'Created' : 'Set'} the balance of ${saved.name} to ${saved.balance} on ${saved.asOf}.`, withBalance)
        }
        return ok(`Imported ${added.length} transactions into the Ledger.${balanceUpdate.note ? ` ${balanceUpdate.note}` : ''}`, withBalance)
      }),
  )

  server.registerTool(
    'update_transactions',
    {
      title: 'Edit transactions',
      description: `Change one or more transactions by id (get ids from find_transactions). Use for re-categorising many at once, fixing amounts, adding notes or tags. ${CATEGORY_HELP}`,
      inputSchema: z.object({
        updates: z
          .array(
            z.object({
              id: z.string(),
              date: iso.optional(),
              amount: z.number().positive().optional(),
              direction: z.enum(['in', 'out']).optional(),
              description: z.string().min(1).max(200).optional(),
              category: z.string().max(60).optional(),
              account: z.string().max(80).optional(),
              notes: z.string().max(2000).optional(),
              tags: z.array(z.string().max(40)).max(20).optional().describe('Replaces the tags'),
              add_tags: z.array(z.string().max(40)).max(20).optional(),
            }),
          )
          .min(1)
          .max(500),
      }),
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ updates }) =>
      run(true, async (l) => {
        const { transactions } = await l.load()
        const byId = new Map(transactions.map((t) => [t.id, t]))
        const missing = updates.filter((u) => !byId.has(u.id)).map((u) => u.id)
        if (missing.length) return fail(`No transaction with id ${missing.slice(0, 5).join(', ')}. Use find_transactions to get current ids.`)
        const changed = updates.map(({ id, add_tags, tags, ...f }) => {
          const t = byId.get(id)!
          const nextTags = parseTags([...(tags ?? t.tags), ...(add_tags ?? [])].join(','))
          return { ...t, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), tags: nextTags } as Transaction
        })
        await l.updateTransactions(changed)
        return ok(`Updated ${changed.length} transaction${changed.length === 1 ? '' : 's'}.`, { updated: changed.slice(0, 50).map(txOut) })
      }),
  )

  server.registerTool(
    'delete_transactions',
    {
      title: 'Delete transactions',
      description: 'Permanently remove transactions from the Ledger by id. Ask the user first and pass confirm=true only after they agree.',
      inputSchema: z.object({ ids: z.array(z.string()).min(1).max(100), confirm: z.literal(true).describe('Must be true: the user agreed to delete') }),
      annotations: DESTRUCTIVE,
    },
    ({ ids }) =>
      run(true, async (l) => {
        const { transactions } = await l.load()
        const targets = transactions.filter((t) => ids.includes(t.id))
        if (!targets.length) return fail('None of those ids are in the Ledger.')
        await l.deleteTransactions(targets)
        return ok(`Deleted ${targets.length} transaction${targets.length === 1 ? '' : 's'}.`, { deleted: targets.map(txOut) })
      }),
  )

  // ------------------------------------------------------------------ accounts and goals

  server.registerTool(
    'save_account',
    {
      title: 'Add or update account',
      description:
        'Add an account, investment, pension, property, loan, card or insurance policy, or update one by id (e.g. a new balance). For debts, balance is the amount still owed. For insurance, balance is the sum insured (optional) and monthly the premium.',
      inputSchema: z.object({
        id: z.string().optional().describe('Leave empty to add a new account'),
        name: z.string().min(1).max(80),
        type: z.enum(ACCOUNT_TYPE_VALUES).describe(ACCOUNT_TYPES.map((t) => `${t.value} = ${t.label}`).join('; ')),
        balance: z.number().min(0),
        currency: z.string().length(3).optional(),
        as_of: iso.optional().describe('Date of the balance; default today'),
        institution: z.string().max(80).optional(),
        rate_percent: z.number().min(-50).max(100).nullable().optional().describe('Yearly interest or expected return'),
        monthly: z.number().min(0).optional().describe('Monthly contribution, loan payment or premium'),
        notes: z.string().max(1000).optional(),
      }),
      annotations: WRITE,
    },
    (a) =>
      run(true, async (l) => {
        const d = await l.load()
        const existing = a.id ? d.accounts.find((x) => x.id === a.id) : undefined
        if (a.id && !existing) return fail(`No account with id ${a.id}. Use list_accounts_and_goals.`)
        const saved = await l.saveAccount(
          {
            name: a.name.trim(),
            type: a.type,
            institution: a.institution ?? existing?.institution ?? '',
            currency: (a.currency ?? existing?.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase(),
            balance: money(a.balance),
            asOf: a.as_of ?? todayIso(),
            rate: a.rate_percent === undefined ? existing?.rate ?? null : a.rate_percent,
            monthly: money(a.monthly ?? existing?.monthly ?? 0),
            notes: a.notes ?? existing?.notes ?? '',
          },
          existing,
        )
        return ok(existing ? `Updated ${saved.name}.` : `Added ${saved.name}.`, { id: saved.id, name: saved.name, type: saved.type, balance: saved.balance, currency: saved.currency })
      }),
  )

  server.registerTool(
    'delete_account',
    {
      title: 'Delete account',
      description: 'Remove an account from the Ledger by id. Ask the user first; pass confirm=true only after they agree.',
      inputSchema: z.object({ id: z.string(), confirm: z.literal(true) }),
      annotations: DESTRUCTIVE,
    },
    ({ id }) =>
      run(true, async (l) => {
        const a = (await l.load()).accounts.find((x) => x.id === id)
        if (!a) return fail(`No account with id ${id}.`)
        await l.deleteAccount(a)
        return ok(`Removed ${a.name}.`)
      }),
  )

  server.registerTool(
    'save_goal',
    {
      title: 'Add or update goal',
      description: 'Add a savings goal or update one by id. Linking an account (account_id) makes its balance count as saved.',
      inputSchema: z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(80),
        target: z.number().positive(),
        currency: z.string().length(3).optional(),
        target_date: iso.optional(),
        saved: z.number().min(0).optional(),
        monthly: z.number().min(0).optional(),
        account_id: z.string().optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
        notes: z.string().max(1000).optional(),
      }),
      annotations: WRITE,
    },
    (g) =>
      run(true, async (l) => {
        const d = await l.load()
        const existing = g.id ? d.goals.find((x) => x.id === g.id) : undefined
        if (g.id && !existing) return fail(`No goal with id ${g.id}.`)
        if (g.account_id && !d.accounts.some((a) => a.id === g.account_id)) return fail(`No account with id ${g.account_id}.`)
        const saved = await l.saveGoal(
          {
            name: g.name.trim(),
            target: money(g.target),
            currency: (g.currency ?? existing?.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase(),
            targetDate: g.target_date ?? existing?.targetDate ?? '',
            saved: money(g.saved ?? existing?.saved ?? 0),
            monthly: money(g.monthly ?? existing?.monthly ?? 0),
            accountId: g.account_id ?? existing?.accountId ?? '',
            priority: g.priority ?? existing?.priority ?? 'medium',
            notes: g.notes ?? existing?.notes ?? '',
          },
          existing,
        )
        return ok(existing ? `Updated goal ${saved.name}.` : `Added goal ${saved.name}.`, { id: saved.id })
      }),
  )

  server.registerTool(
    'delete_goal',
    {
      title: 'Delete goal',
      description: 'Remove a goal by id. Ask the user first; pass confirm=true only after they agree.',
      inputSchema: z.object({ id: z.string(), confirm: z.literal(true) }),
      annotations: DESTRUCTIVE,
    },
    ({ id }) =>
      run(true, async (l) => {
        const g = (await l.load()).goals.find((x) => x.id === id)
        if (!g) return fail(`No goal with id ${id}.`)
        await l.deleteGoal(g)
        return ok(`Removed goal ${g.name}.`)
      }),
  )

  return server
}
