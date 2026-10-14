# FinBuddy AI assistant plan

Status: draft, in build. Owner: Ajeet. Scope: the MCP connector in `mcp/` and the web app's import and dashboard features.

## 1. Goal

A user connects FinBuddy once to their AI app (Claude, ChatGPT or another MCP app) and can then:

- find and read their own files (statements, payslips, tax documents),
- import statements and keep account balances current,
- ask how they are doing and get a clear, sourced answer in one step,
- get forecasts and reports saved to their Drive, and dashboards that update themselves.

Every number must come from FinBuddy's own calculations, with its source and date. Nothing is invented.

## 2. Principles

1. **One question, one answer.** Common questions need one tool call.
2. **Show the source.** Each figure names its transactions, document or balance date.
3. **Preview before writing, and undo after.** Imports preview first; a whole import can be reversed.
4. **Read freely, write carefully.** Read tools auto-allow; writes ask; deletes always ask.
5. **Say what is stale.** Balances older than 60 days are flagged.
6. **English and German.** Labels, categories and tax terms work in both.
7. **Charts are formulas, not typed numbers.** AI-built visuals read the user's data, so they stay checkable and up to date.

## 3. Current state

| Area | State |
|---|---|
| Connector: 15 tools (read, add, import, update, delete, accounts, goals) | Live (deploy pending for the newest tool) |
| `find_documents` | Built and tested; deploy with `npm run deploy` |
| Web import: closing balance detected, balance as on date | Built; PR #9 |
| Connector `import_statement`: balance | Done (increment 1); tested |
| Reading a document's content | Not yet (increment 1) |
| Undo import | Not yet (increment 2) |
| Month summary, net worth, upcoming payments | Not yet (increment 2) |
| Reports as Google Docs; Dashboard tab with charts | Not yet (increment 3) |
| Skills as MCP prompts; permission defaults | Not yet (increment 3) |
| Tax summary (Germany), balance check, duplicates | Not yet (increment 4) |

## 4. Tools to add

### Increment 1: close the gaps from real use

| Tool | Purpose |
|---|---|
| `find_documents` | Done. Finds saved statements, payslips and tax files by text, type or date. |
| `read_document` | Reads a saved PDF or image so the AI can answer "what was my gross pay in September". Works only on files the app created, which is all uploaded documents. |
| `import_statement` v2 | Also returns the closing balance it finds, and can set the account balance as on a date (`update_account_id`, `balance_as_of`). |

### Increment 2: everyday answers

| Tool | Example question |
|---|---|
| `undo_import` | "Undo the October import." Needs a batch id on each transaction (new column at the end of the sheet). |
| `month_summary(month)` | "How was October?" Income, spending, saved, top categories, change from last month. |
| `net_worth` | "What am I worth?" Assets, debts, and which balances are old. |
| `upcoming_payments(days)` | "What is due in the next 30 days?" |

### Increment 3: reports and visuals

| Tool | Purpose |
|---|---|
| `save_report(title, body, type)` | Saves a dated Google Doc in the FinBuddy folder (monthly check-in, review, forecast). Returns a link. |
| `build_dashboard(widgets)` | Creates or updates a Dashboard tab with formula-driven tables and native charts. Widgets are declared as data (type, measure, period), never code. |
| `forecast_to_sheet(scenario)` | Writes a forecast into its own tab: actual and projected balances side by side. |
| `save_category_rule` | "Always file REWE under Groceries." Future imports follow it. |
| `goal_progress` | "Am I on track for Japan?" |

### Increment 4: careful additions

| Tool | Notes |
|---|---|
| `tax_summary(year)` | Germany first. Groups transactions and tax documents for a return. Labelled as an organising aid, not tax advice. |
| `check_balance(account)` | Compares the stated balance with the transactions since the last balance update. |
| `find_duplicates` | Repeated payments across imports. |

## 5. Skills (MCP prompts)

- `import_statement_guide`: preview first, confirm the account, ask about the balance, report duplicates skipped.
- `monthly_checkin`: `month_summary`, then `net_worth`, then `upcoming_payments`. End with one or two next steps.
- `find_my_file`: `find_documents`, then `read_document` if the user asks what is inside. If nothing matches, say where to upload.
- `first_setup`: accounts and balances first, then goals, in short steps.
- `answer_style`: figure, date and source; flag stale data; no regulated advice; match the user's language.

## 6. Permissions in the AI app

- Always allow: all read tools.
- Needs approval: `import_statement` (apply), `add_transactions`, `update_transactions`, `save_account`, `save_goal`, `save_category_rule`, `undo_import`, `save_report`, `build_dashboard`.
- Always ask: `delete_transactions`, `delete_account`, `delete_goal`.

## 7. Guardrails

- Versioning: reports are new dated files; dashboards are replaced only with approval.
- Approval for every write, including creating Docs and tabs.
- Forecasts are labelled "estimate", with their assumptions shown.
- Permission scope stays `drive.file`: only files the app creates are touched.
- Documents may contain personal data; they are read only when the user asks, and identifiers stay masked in tool output.

## 8. Test guide for the current build

Automated (from `mcp/`):

```
npm run type-check
npm run dev:test          (terminal 1)
npm run test:tools        (terminal 2, expects "All checks passed")
```

Web app (from `frontend/`):

- Upload a bank statement PDF or CSV, check that the closing balance is pre-filled, and import with an account chosen.
- Import a CSV with no balance: enter a balance and an "as on" date, and check the account on the Accounts page.

After deploy (`npm run deploy` in `mcp/`), in the AI app:

- Ask "what is my bank statement" and expect a link from `find_documents`.
- Ask "show my accounts" and "how am I doing" to check the existing tools still answer.

## 9. Increments and checkpoints

Each increment ends with: type-check, tool tests, a short test note, and a PR update. Nothing is merged without a manual check in the web app and in the AI app.
