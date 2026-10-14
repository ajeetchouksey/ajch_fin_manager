# FinBuddy: aligning features and data visualisation

Status: proposal. Companion to `docs/ai-assistant-plan.md`. Nothing here is built yet.

## 1. What we have today

| Screen | What it shows | Period | Visuals |
|---|---|---|---|
| Overview (`LedgerOverview`) | Month totals, spending by category, recent activity, accounts | Calendar month, with a month picker | KPI tiles, category bars, 6-month trend, account list |
| Insights (`InsightsPage`) | Net worth, savings rate, emergency months, gaps, regular payments, where money goes | Last complete months and today | 12-month forecast chart (`ForecastChart`), KPI numbers, lists |
| Transactions, Portfolio, Documents | Records and forms | Any | Tables |
| Connector (AI app) | The same numbers, in chat | Whatever the user asks | Text and JSON; charts only if the AI draws them |

The data is the same underneath. The screens each compute and show it differently, so a number can look different on two screens, and forecasts and actuals are not clearly separated.

## 2. What the reference dashboard does well

These are the patterns to borrow, not the code:

- **One period model.** Every view is a period (salary cycle or calendar month), and every card and chart uses the same boundaries.
- **Actual and estimate are visually separate.** Estimates carry a PROJECTED badge, "Est." labels and a "~" prefix. Running periods show progress.
- **Drivers before totals.** Each change is a row with a bar sized against the opening balance, so a number can be questioned.
- **Stated basis.** Every estimate says what it is based on and what margin it includes.
- **Cautious defaults.** Safety margin on expenses only; income never inflated; irregular items not treated as recurring.

## 3. Principles for FinBuddy

1. **One period, everywhere.** Overview, Insights, Transactions filters, and the connector all use the same period selector: calendar month or salary cycle. The choice is shared, not per screen.
2. **Actual and estimate never share a style.** Actuals are solid; estimates are outlined or hatched, carry a PROJECTED badge, and show their basis in one line.
3. **Every number links to its source.** Clicking a total opens the transactions behind it, already filtered to the same period.
4. **Drivers before totals.** For any change in balance, show the items that caused it, sized against the opening balance.
5. **Same words everywhere.** "Income", "Spending", "Saved", "Balance", "Estimate" mean one thing on every screen and in the connector's answers.
6. **Stale data is visible.** A balance older than 60 days shows its date with a warning colour, on every screen that uses it.
7. **Charts are declarative.** A chart is described by data (measure, period, grouping), not drawn from free-form code. The AI and the app build the same descriptions.

## 4. Visual language

| Meaning | Colour | Mark |
|---|---|---|
| Money in / positive | green | ▲ |
| Money out / negative | red | ▼ |
| Estimate | same colour, outlined or hatched | "Est." or "~", PROJECTED badge |
| Running period | neutral, with a progress bar | "so far" label |
| Routine / recurring | blue | tag "Routine" |
| One-off / extra | amber | tag "One-off" |
| Stale data | amber | date shown |

Keep the colours that already exist in the app's brand tokens. Do not add a second palette for estimates; use outline and labels instead, so the chart still reads in greyscale and in dark mode.

## 5. Feature to visual map

| Feature | Visual | Where it appears |
|---|---|---|
| Period summary (income, spending, saved) | KPI tiles with the change from the previous period | Overview, connector `month_summary` |
| Spending by category | Bars with a previous-period marker | Overview, Insights |
| Category changes ("what changed") | Diverging bars, biggest changes first | Overview, period detail |
| Balance over time | Line with actual and estimate split at today | Insights, Portfolio |
| Period cards (opening, in, out, closing) | Statement-style card, progress for running period | Overview, Statements |
| Budgets | Bar per category, amber near the limit, red over | Overview |
| Recurring payments | List with next date and monthly total | Insights, Transactions |
| Forecast (next 12 months, next period) | Line for balance; table of expected items | Insights, Portfolio |
| Driver breakdown | Bars per item sized against opening balance | Period detail, forecast detail |
| Stale balances | Date with warning | Portfolio, Overview |
| Net worth and emergency fund | KPI tiles; months-of-cover gauge | Insights |
| Gaps and next steps | Cards with severity, not charts | Insights, connector `financial_review` |

## 6. Data the visuals need

- **Period boundaries** from one helper, used by all screens and the connector. Salary cycle needs the salary credit dates; calendar month needs nothing extra.
- **Balances by date** from the Balances tab, with the transaction sums in between. Opening and closing balances come from here, never from summing transactions alone.
- **Estimates as their own series**, returned with a `basis` text, the period they cover, and the margin used. Never mixed into actual totals.
- **Category and recurring tags** on every transaction, so breakdowns and recurring lists are consistent.

## 7. Decisions needed

1. **Default period:** salary cycle or calendar month? The reference uses salary cycle. My recommendation is calendar month as the default, salary cycle one switch away, since it matches statements and the rest of the app.
2. **Salary detection:** category "Salary" plus an optional employer name in settings, with the rule "at least half the median salary" to ignore small credits. Confirm.
3. **Safety margin:** keep the reference's 10% on expenses only, shown on every estimate? Confirm.
4. **Connector visuals:** should the AI draw charts inline in chat, or return data for the app's own charts? I'd do both: inline charts for quick questions, and a saved Google Sheets dashboard for the full view.

## 8. Build order

1. **Period helper and tests (done).** `frontend/src/lib/ledger/periods.ts`, tested in `frontend/tests/periods.test.ts` (`npm test` in `frontend/`). Used by everything below.
2. **Period selector and Overview (done).** Shared selector (`usePeriodMode`, saved on the device and synced across components). Overview navigates periods, shows the previous period in the tiles, and marks each category bar with its change.
3. **Estimate style and driver breakdown (done).** Forecast lines are dashed and labelled Estimate, with a basis line. Driver rows show each monthly change (income, spending, safety margin, savings moved, interest) and the net. The 10% margin on spending now lives in the forecast engine, so the app and the connector report the same figures.
4. **Budgets and recurring list (done).** Budgets live in a Budgets tab of the Ledger (one row per category, created automatically for existing Ledgers) and show on the Overview for the selected period, in calendar or salary-cycle mode. Recurring payments with next dates already appear on Insights ("Regular payments").
5. **Connector alignment (done).** `month_summary` (calendar or salary cycle, same boundaries as the app, with previous period, categories, budgets and a six-period series) and `forecast_what_if` (estimate label and drivers). The connector instructions tell the AI to use the period tool, to label estimates, and to chart only numbers it got from a tool.
6. **Sheets dashboard tab.** Formula-driven charts over the same period definitions, from the earlier plan.

Each step ships with tests for the numbers (the period helper and the forecast), and a visual check in the web app before the next step starts.
