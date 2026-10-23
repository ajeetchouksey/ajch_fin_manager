/**
 * The tools the user's AI app can call. Every figure comes from the same code as the web app
 * (statement reader, categoriser, review engine), so the AI explains numbers rather than inventing them.
 */

import { McpServer } from '@modelcontextprotocol/server'
import { getMcpAuthContext } from 'agents/mcp'
import { z } from 'zod'
import { analyzeTable, findCsvBalance, parseCsv, type DateFormat } from '@finbuddy/core/ledger/csv'
import { TRANSFER_CATEGORY, isTransfer, learnFromLedger, payeeKey, suggestCategory } from '@finbuddy/core/ledger/categorize'
import { combinedTotals } from '@finbuddy/core/ledger/fx'
import { matchToLedger, DEFAULT_MATCH_DAYS } from '@finbuddy/core/ledger/reconcile'
import { statementRow, type Sign, type TransactionDraft } from '@finbuddy/core/ledger/statement'
import { dedupeKey, INCOME_CATEGORIES, MORE_EXPENSE_CATEGORIES, newId, parseTags, todayIso, type Transaction } from '@finbuddy/core/ledger/types'
import { ANALYSIS_KINDS, ANALYSIS_STATUSES, CHECKED_METRICS, isStale, ledgerAsOf, verifyFigures, type Analysis, type FigureClaim } from '@finbuddy/core/ledger/analysis'
import { ACCOUNT_TYPES, accountType } from '@finbuddy/core/ledger/portfolio'
import { DEFAULT_CATEGORIES } from '@finbuddy/core/ledger/defaults'
import { baseCurrency, forecast, review, type ReviewInput } from '@finbuddy/core/analysis/engine'
import { change, inSpan, spendingByCategory, totalsFor, ym } from '@finbuddy/core/ledger/summary'
import { buildPeriods, periodContaining, type Period } from '@finbuddy/core/ledger/periods'
import { budgetProgress } from '@finbuddy/core/ledger/budgets'
import { worthChecking } from '@finbuddy/core/ledger/checks'
import { buildReport, choosePeriod } from '@finbuddy/core/ledger/report'
import { planLabelMigration } from '@finbuddy/core/ledger/accounts'
import { explain, LedgerSession } from './ledger'
import { MONTH_VIEW_HTML, MONTH_VIEW_URI, VIEW_MIME } from './views'
import { SCOPE_WRITE, type AccessProps } from './types'

const SPENDING_CATEGORIES = Array.from(new Set([...DEFAULT_CATEGORIES, ...MORE_EXPENSE_CATEGORIES, 'Other']))
const CATEGORY_HELP = `Spending: ${SPENDING_CATEGORIES.join(', ')}. Income: ${INCOME_CATEGORIES.join(', ')}. Between own accounts: ${TRANSFER_CATEGORY}. The user's own categories are fine too.`
const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES.map((t) => t.value) as [string, ...string[]]

const INSTRUCTIONS = `FinBuddy is the user's personal finance Ledger: a Google Sheet in their own Google Drive, also used by the FinBuddy web app.
- Start with ledger_status. Use financial_review for "how am I doing", gaps, forecasts and advice; use find_transactions and spending_breakdown for questions about payments.
- Numbers come from FinBuddy's own calculations. Quote them; do not recompute or invent figures.
- For "how was this month" or "how was my salary cycle", call month_summary with the mode the user uses (calendar by default, or salary). Its periods match the FinBuddy app. Figures in it are actual, not estimates.
- With two currencies, the figures stay per currency. If the user saved an exchange rate in FinBuddy, month_summary also returns combined_at_your_rate: both currencies added at that rate. Say it is an estimate at their rate, and never convert with any other rate.
- Forecasts and what-ifs are estimates. Say so, name the drivers (income, spending, the safety margin, savings) and the months they are based on.
- When the user asks how things compare over time or asks for a picture, draw a small chart from the series or totals you were given, and label any estimate on it. Do not chart numbers you did not get from a tool.
- To import a bank statement (CSV text from an attached file), call import_statement with apply=false first, show the user the preview, then call it again with apply=true. For PDFs or photos, read the rows yourself and use add_transactions.
- Documents the user saved to FinBuddy (statements, payslips, tax documents, receipts) are listed by find_documents. Look there first when the user asks for a file; say so plainly if nothing matches, and give the link when one is found.
- Amounts are always positive; "direction" says money in or out. Transfers between the user's own accounts use the category "${TRANSFER_CATEGORY}".
- To check spending against limits, use list_budgets; to set or change one, use set_budget (ask first).
- For "what looks wrong", clean-up, or after an import, use worth_checking. Show what it found; change categories with update_transactions only after the user agrees.
- To read what is in a saved statement, payslip or tax document, use read_document. Only do this when the user asks for the content.
- If an import went wrong, use list_imports to find it, then undo_import after the user confirms.
- To keep an analysis, recommendation or projection, call save_analysis with apply: false, show the user the preview and whether its figures match the ledger, then call again with apply: true only after they agree. Take every figure from a FinBuddy tool result. Use list_analysis to see what is already saved.
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

function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(binary)
}

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

  // Interactive view shown in the AI chat for month_summary (docs/chat-visuals-spec.md, step 1)
  server.registerResource(
    'month-view',
    MONTH_VIEW_URI,
    { mimeType: VIEW_MIME, description: 'FinBuddy month summary, shown in the chat' },
    async () => ({ contents: [{ uri: MONTH_VIEW_URI, mimeType: VIEW_MIME, text: MONTH_VIEW_HTML }] }),
  )

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
        return ok(`What-if in ${base.currency}. Estimate: investment growth on the extra saving is not included, to stay cautious.`, {
          estimate: true,
          drivers: base.drivers,
          base: base.points.map((p) => ({ month: p.month, cash: p.liquid, net_worth: p.netWorth })),
          scenario,
          cash_may_run_out_in_scenario: runsOut,
          assumptions: base.assumptions,
        })
      }),
  )

  server.registerTool(
    'month_summary',
    {
      title: 'Month or salary cycle summary',
      description:
        'How a calendar month or a salary cycle went: money in and out, change from the previous period, spending by category, budgets, and the last six periods as a series for a chart. Uses the same period boundaries as the FinBuddy app. Defaults to the latest period with data. Figures are actuals, not estimates.',
      inputSchema: z.object({
        mode: z.enum(['calendar', 'salary']).default('calendar').describe('calendar = 1st to last day; salary = from one salary credit to the day before the next'),
        date: iso.optional().describe('Any date inside the period you want; default is the latest period with data'),
        currency: z.string().length(3).optional(),
      }),
      _meta: { ui: { resourceUri: MONTH_VIEW_URI } },
      annotations: RO,
    },
    (a) =>
      run(false, async (l) => {
        const d = await l.load()
        const today = todayIso()
        const currency = (a.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase()
        const salary = a.mode === 'salary' ? buildPeriods('salary', d.transactions, today) : []
        // No salary credits yet: calendar months, as the app does, and say so
        const fellBack = a.mode === 'salary' && !salary.length
        const periods: Period[] = a.mode === 'calendar' || fellBack ? buildPeriods('calendar', d.transactions, today) : salary
        if (!periods.length) return ok('No transactions yet, so there is no period to summarise.')
        const withData = periods.filter((p) => d.transactions.some((t) => inSpan(t.date, p)))
        const chosen = a.date ? periodContaining(a.date, periods) : (withData.at(-1) ?? periods.at(-1))
        if (!chosen) return ok(`No period contains ${a.date}.`)
        const idx = periods.indexOf(chosen)
        const prev = idx > 0 ? periods[idx - 1] : undefined
        const span = { start: chosen.start, end: chosen.end }
        const totals = totalsFor(d.transactions, span, currency)
        const before = prev ? totalsFor(d.transactions, prev, currency) : null
        // Every category from either period, so the rows add up to the total and a category that only
        // existed last period still shows (with 0 this period)
        const cats = spendingByCategory(d.transactions, span, currency, 1000)
        const prevCats = prev ? spendingByCategory(d.transactions, prev, currency, 1000) : []
        const names = Array.from(new Set([...cats.map((c) => c.category), ...prevCats.map((c) => c.category)]))
        const categoryRows = names
          .map((name) => {
            const c = cats.find((x) => x.category === name)
            const p = prevCats.find((x) => x.category === name)
            return { category: name, amount: c?.amount ?? 0, share_percent: c ? Math.round(c.share * 100) : 0, previous_amount: p?.amount ?? 0 }
          })
          .sort((a, b) => Math.max(b.amount, b.previous_amount) - Math.max(a.amount, a.previous_amount))
        const series = periods.slice(Math.max(0, idx - 5), idx + 1).map((p) => ({ start: p.start, end: p.end, ...totalsFor(d.transactions, p, currency) }))
        const budgets = budgetProgress(d.budgets, d.transactions, span, currency)
        const label = chosen.kind === 'salary' ? (chosen.partial ? 'Before the first salary credit' : chosen.open ? 'Salary cycle so far' : 'Salary cycle') : 'Calendar month'
        const basis =
          chosen.kind === 'salary'
            ? `From the salary credit on ${chosen.start} to the day before the next one${chosen.open && chosen.expectedEnd ? `, expected to end ${chosen.expectedEnd}` : ''}. Transfers between your own accounts are left out.`
            : 'The calendar month, 1st to last day. Transfers between your own accounts are left out.'
        const spendChange = before ? change(totals.spending, before.spending) : null
        // With a rate the user typed, both of its currencies added together in the first one (an estimate at that rate)
        const fx = await l.exchangeRate()
        const both = fx && d.transactions.some((t) => t.currency === fx.base) && d.transactions.some((t) => t.currency === fx.quote) ? combinedTotals(d.transactions, span, fx) : null
        return ok(`${label} ${chosen.start} to ${chosen.end}: in ${totals.income}, out ${totals.spending}, left ${totals.net} ${currency}.${both && fx ? ` Both currencies together at your rate (1 ${fx.base} = ${fx.rate} ${fx.quote}): in ${both.income}, out ${both.spending}, left ${both.net} ${fx.base}.` : ''}`, {
          period: { kind: chosen.kind, label, start: chosen.start, end: chosen.end, partial: chosen.partial ?? false, open: chosen.open ?? false, expected_end: chosen.expectedEnd },
          fell_back_to_calendar: fellBack,
          currency,
          previous_period: prev ? { start: prev.start, end: prev.end } : null,
          totals: { income: totals.income, spending: totals.spending, net: totals.net, transactions: totals.count },
          combined_at_your_rate: both && fx ? { rate: `1 ${fx.base} = ${fx.rate} ${fx.quote}`, currency: fx.base, income: both.income, spending: both.spending, net: both.net, transactions: both.count, note: 'Estimate: the two currencies added at the rate the user typed in Settings.' } : null,
          previous_totals: before ? { income: before.income, spending: before.spending, net: before.net } : null,
          spending_change_percent: spendChange === null ? null : Math.round(spendChange * 100),
          categories: categoryRows,
          budgets: budgets.map((b) => ({ category: b.category, limit: b.limit, spent: b.spent, used_percent: Math.round(b.used * 100), remaining: b.remaining, state: b.state })),
          series: series.map((p) => ({ start: p.start, end: p.end, income: p.income, spending: p.spending, net: p.net })),
          basis,
        })
      }),
  )

  server.registerTool(
    'monthly_report',
    {
      title: 'Monthly report',
      description:
        'The report for you and your partner: headline, figures against the previous period, a watch list of categories that moved beyond a threshold, budgets, and the basis. Same figures as the Report page in the app. Causes are given only where the data shows them; otherwise the note says "driver to be confirmed".',
      inputSchema: z.object({
        mode: z.enum(['calendar', 'salary']).default('calendar'),
        date: iso.optional().describe('Any date inside the period; default is the latest period with data'),
        threshold_percent: z.number().min(5).max(100).default(20).describe('Watch a category that moved at least this much'),
        min_amount: z.number().min(0).default(50).describe('…and by at least this amount'),
        currency: z.string().length(3).optional(),
      }),
      annotations: RO,
    },
    (a) =>
      run(false, async (l) => {
        const d = await l.load()
        const currency = (a.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase()
        const c = choosePeriod(d.transactions, a.mode, todayIso(), a.date)
        if (!c.chosen) return ok('No transactions yet, so there is no period to report on.')
        const monthLabel = (start: string) => new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        const labelOf = (p: Period) =>
          p.kind === 'salary' ? `salary cycle from ${p.start} to ${p.open && p.expectedEnd ? p.expectedEnd : p.end}` : monthLabel(p.start)
        const report = buildReport({
          transactions: d.transactions,
          budgets: d.budgets,
          currency,
          span: { start: c.chosen.start, end: c.chosen.end },
          label: labelOf(c.chosen),
          open: c.chosen.open,
          expectedEnd: c.chosen.expectedEnd,
          previous: c.previous ? { span: { start: c.previous.start, end: c.previous.end }, label: labelOf(c.previous) } : null,
          thresholdPercent: a.threshold_percent,
          minAmount: a.min_amount,
        })
        return ok(report.headline.join(' '), {
          period: report.label,
          previous_period: report.previousLabel,
          currency,
          fell_back_to_calendar: c.fellBack,
          headline: report.headline,
          figures: report.metrics.map((m) => ({ item: m.label, current: m.current, previous: m.previous, change_percent: m.change === null ? null : Math.round(m.change * 100) })),
          watch_list: report.watchList.map((m) => ({ item: m.label, current: m.current, previous: m.previous, change_percent: m.change === null ? null : Math.round(m.change * 100), note: m.note })),
          categories: report.categories.map((m) => ({ item: m.label, current: m.current, previous: m.previous, change_percent: m.change === null ? null : Math.round(m.change * 100), note: m.note || undefined })),
          budgets: report.budgets.map((b) => ({ category: b.category, limit: b.limit, spent: b.spent, state: b.state })),
          basis: report.basis,
        })
      }),
  )

  // ------------------------------------------------------------------ AI analysis (see docs/ai-analysis-spec.md)

  server.registerTool(
    'save_analysis',
    {
      title: 'Save an analysis',
      description:
        'Save an analysis, recommendation, projection, data issue or categorisation suggestion to the user\'s Analysis tab in FinBuddy. Every figure you cite is checked against the user\'s ledger for its period, and the entry shows whether it matches. Call with apply: false first and show the user the preview; call again with apply: true only after the user agrees. Use figures you got from FinBuddy tools, and say they are estimates where they are.',
      inputSchema: z.object({
        kind: z.enum(ANALYSIS_KINDS),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(5000),
        period_start: iso.optional(),
        period_end: iso.optional(),
        figures: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              value: z.number(),
              metric: z.enum(CHECKED_METRICS).describe("What the figure measures: income, spending, net, category_spending, savings_rate (percent of money in), transaction_count, or account_balance (the balance on the last day of the period)"),
              period_start: iso.optional(),
              period_end: iso.optional(),
              category: z.string().max(80).optional(),
              account: z.string().max(80).optional().describe('For account_balance: the account id or name'),
              currency: z.string().length(3).optional(),
              source: z.string().max(200).optional().describe('The FinBuddy tool and inputs the figure came from'),
            }),
          )
          .max(30)
          .default([]),
        apply: z.boolean().default(false),
      }),
      annotations: WRITE,
    },
    (a) =>
      run(a.apply, async (l) => {
        const d = await l.load()
        const currency = baseCurrency({ transactions: d.transactions, accounts: d.accounts })
        const entryPeriod = a.period_start && a.period_end ? { start: a.period_start, end: a.period_end } : null
        const claims: FigureClaim[] = []
        for (const f of a.figures) {
          const period = f.period_start && f.period_end ? { start: f.period_start, end: f.period_end } : entryPeriod
          if (!period) return fail(`The figure "${f.name}" has no period. Give the entry a period, or give each figure one.`)
          claims.push({ name: f.name, value: money(f.value), metric: f.metric, period, category: f.category, account: f.account, currency: (f.currency ?? currency).toUpperCase(), source: f.source })
        }
        const { figures, verified } = verifyFigures(claims, d.transactions, d.accounts)
        const entry: Analysis = {
          id: newId('an'),
          kind: a.kind,
          title: a.title.trim(),
          body: mask(a.body.trim()),
          periodStart: a.period_start ?? '',
          periodEnd: a.period_end ?? '',
          figures,
          verified,
          status: 'open',
          writtenBy: 'AI app (via FinBuddy connector)',
          createdAt: new Date().toISOString(),
          ledgerAsOf: ledgerAsOf(d.transactions),
        }
        const summary = {
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
          period: entry.periodStart ? `${entry.periodStart} to ${entry.periodEnd}` : null,
          verified: entry.verified,
          figures: figures.map((f) => ({ name: f.name, value: f.value, ledger_value: f.actual, matches: f.matches, source: f.source ?? null })),
        }
        if (!a.apply) {
          return ok(
            `Preview only, nothing saved. Verified: ${verified}${verified === 'no' ? ' (some figures do not match the ledger; show the user which)' : ''}. Call again with apply: true if the user agrees.`,
            { ...summary, body: entry.body },
          )
        }
        await l.saveAnalysis(entry)
        return ok(`Saved "${entry.title}" to the Analysis tab. Verified: ${verified}.`, summary)
      }),
  )

  server.registerTool(
    'list_analysis',
    {
      title: 'Saved analyses',
      description: 'The analyses, recommendations, projections and data issues saved to the user\'s Analysis tab, newest first, with verification and whether each may be out of date.',
      inputSchema: z.object({
        kind: z.enum(ANALYSIS_KINDS).optional(),
        status: z.enum(ANALYSIS_STATUSES).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: RO,
    },
    (q) =>
      run(false, async (l) => {
        const d = await l.load()
        const rows = d.analysis
          .filter((x) => (!q.kind || x.kind === q.kind) && (!q.status || x.status === q.status))
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
          .slice(0, q.limit)
        return ok(`${rows.length} saved entr${rows.length === 1 ? 'y' : 'ies'}.`, {
          entries: rows.map((x) => ({
            id: x.id,
            kind: x.kind,
            title: x.title,
            body: x.body,
            period: x.periodStart ? `${x.periodStart} to ${x.periodEnd}` : null,
            verified: x.verified,
            status: x.status,
            written_by: x.writtenBy,
            created_at: x.createdAt,
            may_be_out_of_date: isStale(x, d.transactions),
            figures: x.figures.map((f) => ({ name: f.name, value: f.value, ledger_value: f.actual, matches: f.matches })),
          })),
        })
      }),
  )

  // ------------------------------------------------------------------ account links (F01)

  server.registerTool(
    'preview_account_link',
    {
      title: 'Preview linking rows to an account',
      description:
        'Shows how many payments carrying an account label (for example "Savings") would be linked to an account id, before anything changes. Writes nothing. Use it before any link is applied.',
      inputSchema: z.object({
        account: z.string().min(1).max(80).describe('Account id or name the rows belong to'),
        label: z.string().min(1).max(80).default('Savings').describe('The label the rows carry today'),
      }),
      annotations: RO,
    },
    (q) =>
      run(false, async (l) => {
        const d = await l.load()
        const wanted = q.account.trim().toLowerCase()
        const acc = d.accounts.find((a) => a.id === q.account.trim() || a.name.trim().toLowerCase() === wanted)
        if (!acc) return fail(`No account matches "${q.account}". Use list_accounts_and_goals to see the ids.`)
        const plan = planLabelMigration(d.transactions.map((t) => ({ account: t.account, accountId: t.accountId })), q.label)
        const linkedElsewhere = d.transactions.filter((t) => t.accountId && t.accountId !== acc.id).length
        const sample = d.transactions
          .filter((t) => !t.accountId && t.account === q.label)
          .slice(0, 5)
          .map((t) => ({ date: t.date, direction: t.direction, amount: t.amount, description: mask(t.description) }))
        return ok(`Preview: ${plan.toLink} payment${plan.toLink === 1 ? '' : 's'} labelled "${q.label}" would be linked to ${acc.name}. Nothing has been changed.`, {
          account: { id: acc.id, name: acc.name },
          label: q.label,
          total_rows: d.transactions.length,
          would_link: plan.toLink,
          already_linked: plan.alreadyLinked,
          linked_to_another_account: linkedElsewhere,
          other_labels: plan.otherLabels,
          without_label: plan.unlabelled,
          sample,
        })
      }),
  )

  // ------------------------------------------------------------------ budgets

  server.registerTool(
    'list_budgets',
    {
      title: 'Budgets',
      description: 'Monthly budgets per category, with what has been spent in the chosen period (calendar month or salary cycle) and whether each one is ok, close to the limit or over.',
      inputSchema: z.object({
        mode: z.enum(['calendar', 'salary']).default('calendar'),
        date: iso.optional().describe('Any date inside the period; default is the latest period with data'),
        currency: z.string().length(3).optional(),
      }),
      annotations: RO,
    },
    (a) =>
      run(false, async (l) => {
        const d = await l.load()
        const currency = (a.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase()
        const c = choosePeriod(d.transactions, a.mode, todayIso(), a.date)
        if (!c.chosen) return ok('No transactions yet, so there is no period to check budgets against.', { budgets: d.budgets.map((b) => ({ category: b.category, limit: b.monthly, currency: b.currency })) })
        const span = { start: c.chosen.start, end: c.chosen.end }
        const rows = budgetProgress(d.budgets, d.transactions, span, currency)
        const over = rows.filter((r) => r.state === 'over').length
        return ok(`${rows.length} budget${rows.length === 1 ? '' : 's'} for ${c.chosen.start} to ${c.chosen.end}${over ? `, ${over} over` : ''}.`, {
          period: { start: c.chosen.start, end: c.chosen.end, kind: c.chosen.kind },
          currency,
          budgets: rows.map((r) => ({ category: r.category, limit: r.limit, spent: r.spent, used_percent: Math.round(r.used * 100), remaining: r.remaining, state: r.state })),
        })
      }),
  )

  server.registerTool(
    'worth_checking',
    {
      title: 'Worth checking',
      description:
        'Things in the Ledger that look wrong and are quick to fix, the same list the FinBuddy app shows: payments in the user\'s own name not marked as Transfer, regular income not marked as Salary, a payee filed under an unusual category, payee spelling variants, a monthly payment paid twice or missing, and a large share of spending in Other. Nothing is changed. To fix one, show it to the user and, if they agree, call update_transactions with the transaction ids and the suggested category.',
      inputSchema: z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month for the Other-share check (YYYY-MM); default the latest month'),
        other_share_limit: z.number().min(0).max(1).default(0.1).describe('Flag a month whose Other spending is above this share'),
      }),
      annotations: RO,
    },
    (a) =>
      run(false, async (l) => {
        const d = await l.load()
        const checks = worthChecking(d.transactions, { ownNames: await l.ownNames(), month: a.month, otherShareLimit: a.other_share_limit })
        if (!checks.length) return ok('Nothing worth checking: categories, salary and transfers look consistent.', { checks: [] })
        return ok(`${checks.length} thing${checks.length === 1 ? '' : 's'} worth checking.`, {
          checks: checks.map((c) => ({
            kind: c.kind,
            title: mask(c.title),
            detail: mask(c.detail),
            suggested_category: c.suggestedCategory ?? null,
            count: c.transactionIds.length,
            transaction_ids: c.transactionIds.slice(0, 100),
          })),
        })
      }),
  )

  server.registerTool(
    'set_budget',
    {
      title: 'Set budget',
      description: 'Set or change the monthly limit for a spending category. One budget per category and currency.',
      inputSchema: z.object({
        category: z.string().min(1).max(80),
        monthly: z.number().positive().describe('Limit for one period (a month or a salary cycle)'),
        currency: z.string().length(3).optional(),
      }),
      annotations: WRITE,
    },
    (a) =>
      run(true, async (l) => {
        const d = await l.load()
        const currency = (a.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase()
        const category = a.category.trim()
        const existing = d.budgets.find((b) => b.category.toLowerCase() === category.toLowerCase() && b.currency === currency)
        const saved = await l.saveBudget({ category, monthly: money(a.monthly), currency }, existing)
        return ok(`${existing ? 'Changed' : 'Set'} the ${saved.category} budget to ${saved.monthly} ${saved.currency}.`, { category: saved.category, monthly: saved.monthly, currency: saved.currency })
      }),
  )

  server.registerTool(
    'delete_budget',
    {
      title: 'Delete budget',
      description: 'Remove the budget for a category. Needs confirm: true, after the user agrees.',
      inputSchema: z.object({
        category: z.string().min(1).max(80),
        currency: z.string().length(3).optional(),
        confirm: z.boolean().default(false),
      }),
      annotations: DESTRUCTIVE,
    },
    (a) =>
      run(true, async (l) => {
        if (!a.confirm) return fail('Not deleted. Ask the user to confirm, then call delete_budget again with confirm: true.')
        const d = await l.load()
        const currency = (a.currency ?? baseCurrency({ transactions: d.transactions, accounts: d.accounts })).toUpperCase()
        const existing = d.budgets.find((b) => b.category.toLowerCase() === a.category.trim().toLowerCase() && b.currency === currency)
        if (!existing) return fail(`No budget for ${a.category} in ${currency}.`)
        await l.deleteBudget(existing)
        return ok(`Deleted the ${existing.category} budget.`)
      }),
  )

  // ------------------------------------------------------------------ documents

  server.registerTool(
    'read_document',
    {
      title: 'Read a saved document',
      description:
        'Read a document saved in FinBuddy (a bank statement, payslip, tax document or receipt), found by id or by a search. Text files come back as text; PDFs and images come back as the file itself so the figures can be read from it. Files over 5 MB are not sent. Only use this when the user asks for what is inside a document.',
      inputSchema: z.object({
        id: z.string().optional().describe('Document id from find_documents'),
        text: z.string().max(100).optional().describe('Search title, notes or file name when no id is given'),
      }),
      annotations: RO,
    },
    (a) =>
      run(false, async (l) => {
        const { documents } = await l.load()
        const doc = a.id
          ? documents.find((d) => d.id === a.id)
          : documents
              .filter((d) => !a.text || [d.title, d.notes, d.fileName].join(' ').toLowerCase().includes(a.text.toLowerCase()))
              .sort((x, y) => y.date.localeCompare(x.date))[0]
        if (!doc) return fail(a.id ? `No document with id ${a.id}. Use find_documents.` : 'No saved document matches. Use find_documents to see what is saved.')
        const file = await l.downloadDocument(doc)
        if (file.bytes.byteLength > 5 * 1024 * 1024) return fail(`${doc.title} is larger than 5 MB, so it is not sent. Open it in Google Drive: ${doc.link}`)
        const meta = `${doc.title} (${doc.type}${doc.date ? `, ${doc.date}` : ''}). Link: ${doc.link}`
        const type = doc.mimeType || file.mimeType
        if (type.startsWith('text/') || type === 'application/json') {
          const text = new TextDecoder().decode(file.bytes).slice(0, 20_000)
          return { content: [{ type: 'text' as const, text: `${meta}\n\n${text}` }] }
        }
        const data = toBase64(file.bytes)
        if (type.startsWith('image/')) {
          return { content: [{ type: 'text' as const, text: meta }, { type: 'image' as const, data, mimeType: type }] }
        }
        return { content: [{ type: 'text' as const, text: meta }, { type: 'resource' as const, resource: { uri: `finbuddy://document/${doc.id}`, mimeType: type, blob: data } }] }
      }),
  )

  // ------------------------------------------------------------------ imports

  server.registerTool(
    'list_imports',
    {
      title: 'Recent imports',
      description: 'Statement imports, newest first, with how many payments each brought in and the period they cover. Use the created_at value with undo_import.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
      annotations: RO,
    },
    (q) =>
      run(false, async (l) => {
        const { transactions } = await l.load()
        const groups = new Map<string, Transaction[]>()
        for (const t of transactions) if (t.source === 'import') groups.set(t.createdAt, [...(groups.get(t.createdAt) ?? []), t])
        const imports = [...groups.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, q.limit)
          .map(([created_at, list]) => {
            const dates = list.map((t) => t.date).sort()
            return {
              created_at,
              payments: list.length,
              from: dates[0],
              to: dates[dates.length - 1],
              accounts: Array.from(new Set(list.map((t) => t.account || 'No account'))),
              currencies: Array.from(new Set(list.map((t) => t.currency))),
            }
          })
        return ok(imports.length ? `${imports.length} recent import${imports.length === 1 ? '' : 's'}.` : 'No statement imports yet.', { imports })
      }),
  )

  server.registerTool(
    'undo_import',
    {
      title: 'Undo an import',
      description:
        'Remove all payments that one statement import added, found by created_at from list_imports. Needs confirm: true, after the user agrees. Account balances the import set are not reverted; say so to the user.',
      inputSchema: z.object({
        created_at: z.string().min(10).describe('The created_at value from list_imports'),
        confirm: z.boolean().default(false),
      }),
      annotations: DESTRUCTIVE,
    },
    (q) =>
      run(true, async (l) => {
        if (!q.confirm) return fail('Not removed. Ask the user to confirm, then call undo_import again with confirm: true.')
        const { transactions } = await l.load()
        const batch = transactions.filter((t) => t.source === 'import' && t.createdAt === q.created_at)
        if (!batch.length) return fail('No statement import has that created_at. Use list_imports.')
        await l.deleteTransactions(batch)
        return ok(`Removed ${batch.length} payment${batch.length === 1 ? '' : 's'} from that import. Account balances it set are not reverted; set them again with save_account if needed.`)
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
        const ownNames = await l.ownNames()
        const userRules = await l.userRules()
        const fallbackCurrency = baseCurrency({ transactions: d.transactions, accounts: d.accounts })
        const drafts: TransactionDraft[] = items.map((t) => ({
          date: t.date,
          direction: t.direction,
          amount: money(t.amount),
          currency: (t.currency ?? fallbackCurrency).toUpperCase(),
          account: t.account?.trim() ?? '',
          category: t.category?.trim() || suggestCategory(t.description, t.direction, learned, { ownNames, userRules })?.category || (t.direction === 'out' ? 'Other' : 'Other income'),
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
        const learned = learnFromLedger(d.transactions)
        const ownNames = await l.ownNames()
        const userRules = await l.userRules()
        const rows = table.slice(analysis.firstRow, analysis.firstRow + 5000).map((r) =>
          statementRow(r, analysis.map, {
            dateFormat: a.date_format as DateFormat,
            sign: a.amounts as Sign,
            currency,
            account: a.account ?? '',
            category: '',
            tags: '',
            notes: '',
            learned,
            ownNames,
            userRules,
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
