# FinBuddy design refresh: implementation plan

Status: proposal for review. Nothing is built yet.
Design source: the **Finance Manager** canvas (Light and Dark tabs) and the **AaryaAI** design system, both in Claude.
Scope: the web app in `frontend/`. The connector (`mcp/`) and sign-in Worker (`src/`) only change where noted.

## 1. Where we start

The app already has most of the *behaviour* the design shows. The refresh is mainly a new shell, a shared visual language, and a few new pieces.

| Already in the app | File(s) | Design reuses it as |
|---|---|---|
| Calendar / salary-cycle period, shared across screens | `hooks/usePeriodMode.ts`, `lib/ledger/periods.ts` | Overview period switch, salary-cycle view |
| KPI tiles, category bars, 6-month trend, recent list | `components/overview/OverviewParts.tsx`, `LedgerOverview.tsx` | Overview cards (restyled) |
| Budgets tab + Overview card | `lib/ledger/budgets.ts`, `BudgetCard.tsx`, `BudgetDialog.tsx` | New Budgets page |
| Statement import (multi-step) | `components/ledger/ImportDialog.tsx` | 3-step import flow |
| Add / edit transaction | `components/ledger/TransactionDialog.tsx` | Add transaction dialog + mobile quick add |
| Bulk re-categorise | `components/ledger/BulkCategoryBar.tsx` | "Needs a category" review |
| Regular payments, forecast | `pages/InsightsPage.tsx`, `ForecastChart.tsx` | "Regular payments" card |
| Report with watch list | `pages/ReportPage.tsx`, `lib/ledger/report.ts` | Reports page |
| Ask an AI / Analysis | `overview/AskAI.tsx`, `pages/AnalysisPage.tsx` | AI assistant panel |
| Accounts, goals | `pages/PortfolioPages.tsx`, `AccountDialog.tsx`, `GoalDialog.tsx` | Accounts and Goals pages |
| Documents, Trash, Tax | `DocumentsPage.tsx`, `TrashPage.tsx`, `TaxPage.tsx` | Documents page; Tax and Trash move under "More" |
| First-login setup | `FirstLoginOnboarding.tsx`, `setup/QuickSetup.tsx` | 4-step welcome flow |
| Brand tokens, Barlow fonts, dark theme | `index.css`, `@aaryaai/brand`, `@fontsource/*` | Kept; extended with light theme and category colours |

What is new: a light theme next to the existing dark one, a fixed colour per category, a sidebar shell, a Budgets page, payee clean-up, the "Worth checking" rules, and a few chart types (stacked bar, donut, stacked columns).

## 2. Decisions

**All six approved as recommended (22 Oct 2026).**

| # | Decision | Options | Decision |
|---|---|---|---|
| D1 | Themes | Dark only (today) · Light + dark | **Both**, following the system setting, with a switch in Settings. Dark stays the default for existing users. |
| D2 | Navigation | Top bar with 9 items (today) · Sidebar with 8 · 5 groups (ux-plan F1) | **Sidebar on desktop** (Overview, Transactions, Budgets, Goals, Accounts, Reports, Documents, Settings); Insights merges into Overview + Reports; Tax, Analysis, Trash under "More". **Phone tab bar:** Home, Activity, **+**, Budgets, Goals. |
| D3 | Money colours | Teal/purple (`--color-viz-in/out` today) · Green/red (visualisation-alignment §4) · Green/orange (design) | **Green in, orange out.** Orange keeps "spending" calm; red is reserved for *over budget*. Update `visualization-alignment.md` §4 to match. |
| D4 | Number font | Barlow · IBM Plex Mono | **Plex Mono** for amounts (tabular, matches the old app and the design system). Adds `@fontsource/ibm-plex-mono`. |
| D5 | AI assistant | Connector only (ADR 002/004) · In-app chat with the user's own key | Keep **ADR 004**: the panel shows the conversation UI but sends questions through the user's connected AI app, or explains how to connect one. Revisit with a new ADR if in-app keys are wanted. |
| D6 | Two currencies | Build now · Later | **Later.** The Ledger is EUR-only today; keep the design as a concept until an INR account exists. |

## 3. Foundations (phase 0)

Small, testable pieces that every screen then uses.

1. **Theme tokens** in `index.css`
   - Define semantic variables (`--paper`, `--surface`, `--ink`, `--ink-2`, `--muted`, `--line`, `--tint`, `--good`, `--bad`, `--warn`, `--income`, `--spending`) once for dark and once for light, under `:root` and `[data-theme="light"]`.
   - Map Tailwind `@theme` colours to them so existing classes (`bg-canvas`, `text-slate-300`, `border-line`) keep working; replace hard-coded slate text colours step by step.
   - Values: take them from the design system's `tokens.json` (`project/ds/aaryaai/tokens.json` in the canvas).
2. **Theme switch**: `hooks/useTheme.ts` (same pattern as `usePeriodMode`: device-stored, `prefers-color-scheme` fallback), sets `data-theme` on `<html>`; `color-scheme` follows it.
3. **Category colours**: `lib/ledger/categoryColors.ts`
   - One map from every category in `types.ts` (`EXPENSE_CATEGORIES`, `MORE_EXPENSE_CATEGORIES`, income categories) to a light and a dark hex.
   - `categoryColor(name, theme)` with a fallback for user-defined categories (hash to a fixed spare palette).
   - Lives in `lib/` so the connector can return the same colours with chart data.
   - Test: every built-in category has a colour; no two built-ins share one; text-on-tint contrast passes 4.5:1 (`frontend/tests/categoryColors.test.ts`).
4. **Shared UI components** in `components/ui/`
   - `KpiCard`, `CategoryChip` (dot + tint), `CategoryAvatar`, `SegmentedControl` (replaces ad-hoc toggles), `StackedBar` (split strip + legend), `Donut`, `StackedColumns`, `InsightCard` ("Worth checking"), `EmptyState` (title, one sentence, one action — ux-plan F5).
   - Charts stay SVG/CSS, no chart library (matches `TrendChart` / `ForecastChart` today).
5. **Grouping for stacked charts**: `lib/ledger/categoryGroups.ts` — Housing, Health, Transport, Groceries, **Bills** (utilities, mobile, subscriptions, insurance, fees, taxes), **Lifestyle** (travel, dining, shopping, fitness, personal care, education, entertainment), Other. Tested.

## 4. Screens

Each phase ships on its own branch with tests and a visual check in both themes, as `visualization-alignment.md` §8 already requires.

### Phase 1: shell and navigation
- `Layout.tsx`: sidebar (logo lockup "aarya**ai** · Finance Manager", nav, import card at the bottom) for `md+`; content max width as today.
- `Header.tsx`: becomes a slim top bar on phones only; `TabBar` gets five items with a raised **+** that opens quick add.
- `navigation.ts`: new `NAV_ITEMS` + `MORE_ITEMS`; add `/budgets` route.
- Keep the ambient glow in dark only.

### Phase 2: Overview (`LedgerOverview.tsx`)
- Header: eyebrow "From your ledger · last entry {date}", title "{Month} overview" / "Salary cycle overview", `SegmentedControl` bound to `usePeriodMode`.
- KPI row: balance hero (indigo) + Income / Spending / Left over, each with change vs previous period (existing `KpiTiles` logic).
- Cash flow: green/orange paired bars for the last 6 periods (adapt `TrendChart`), one note line for the biggest month.
- Where it went: `StackedBar` + category bars coloured by category (adapt `CategoryBars`).
- Recent transactions with `CategoryChip`s; Worth checking (phase 8 rules); Regular payments (reuse Insights logic); goals empty state.

### Phase 3: Transactions (`TransactionsPage.tsx`)
- Totals strip for the selected period (count, in, out excl. transfers, amount in "Other").
- "Where {month}'s income went": `StackedBar` of categories + left over.
- Filter bar: search, category, period, In / Out segmented control.
- "Needs a category" banner → opens `BulkCategoryBar` pre-filtered to Other.
- Table rows: avatar tinted by category, chip with dot, green for money in.

### Phase 4: Budgets (new `pages/BudgetsPage.tsx`)
- Donut of the period's spending by category.
- Table: last three months per category + a limit input per row, prefilled with the 3-month average (ux-plan F9), saved through `lib/ledger/budgets.ts`.
- Suggestion card (e.g. "Housing doubles when two rent payments land in one month").
- `BudgetCard` on the Overview links here.

### Phase 5: Reports (`ReportPage.tsx` + parts of `InsightsPage.tsx`)
- Year totals, income-vs-spending lines with the peak month labelled, `StackedColumns` by category group, top payees (needs phase 8 payee clean-up), tax helper card linking to `/tax`.
- Insights content (net worth, emergency months, forecast) moves here or to Overview per D2.

### Phase 6: Goals and Accounts (`PortfolioPages.tsx`)
- Goals: unassigned savings hero, goal idea cards that open `GoalDialog` prefilled, new-goal panel.
- Accounts: account card with balance date (stale warning per visualisation §3.6), "Complete your picture" tiles for each account type.

### Phase 7: Import, add transaction, documents, onboarding
- **Import** (`ImportDialog.tsx`): numbered stepper Upload → Check → Done (ux-plan step 2); preview table with category chip per row and a reason line ("Rule: …", "Seen before", "Check: …"); duplicates counted; Undo on the done step.
- **Add transaction** (`TransactionDialog.tsx`): Money out / in / Transfer control, category chips, split rows (verify current split support first), receipt attach. Phone: full-screen quick add with keypad.
- **Documents**: type tabs with counts, duplicate banner (same name + size), empty-type tiles.
- **Onboarding** (`FirstLoginOnboarding.tsx` + `QuickSetup.tsx`): 4 steps — about you (currencies, calendar vs salary month), bring money in, categories on/off with colours, done.

### Phase 8: data rules behind "Worth checking"
New in `lib/ledger/`, each with tests, so the app and the connector say the same thing:

| Rule | Example from real data |
|---|---|
| Recurring payee filed under a different category than last time | Rent in "Other" while last month was Housing |
| Same payee under several spellings → suggest merge | "Universal-Investment", "Univsrsal-Investment", "Universal Investment" |
| Transfers to own accounts counted as spending | Wise, Trade Republic payments in the user's own name |
| Salary not recognised (cycle longer than ~35 days) | Employer payments filed as "Other income" broke the salary cycle |
| Month with two / no payments of a monthly item | Two rents in June, none in July |
| Share of spending in "Other" above a threshold | 64% of a cycle in Other before clean-up |

Salary detection: category "Salary" **or** the employer name from Settings, amount ≥ half the median salary (visualisation-alignment decision 2).

**Status: done** (branch `feat/categorize-parity`). The categorisation used to clean the data for the design now runs in the app and the connector:

- `categorize.ts`: new keywords from real statements (Getsafe, Conergia/Lokalstrom, ARD Beitragsservice, RSG Group, sports clubs, Lebara, Taxfix, shoe/outlet shops, Basar, Google One, experimenta, DB Vertrieb, Müller as Personal care, "account management"/"basic charge" fees); `merchantText()` unwraps PayPal texts so each merchant gets its own payee key and rule match; learned history also matches near spellings (edit distance ≤ 2, keys ≥ 8 letters); optional `ownNames` turns payments in the user's own or a household member's name into Transfer (or Savings & investments), unless a clear rule such as Salary or Housing matches.
- `payees.ts`: groups payee spellings. `checks.ts`: `worthChecking()` with own-transfer, likely-salary, category-drift, payee-variants, double/missing monthly payment and Other-share checks. Nothing is changed automatically; each check carries the rows and a suggested category.
- Own names come from the Google sign-in name and `householdMembers` in the web app. The connector has only the email, so it relies on learned history there.
- Tests: `tests/categorize.test.ts`, `tests/checks.test.ts`.
- Still to wire into the UI: the Overview "Worth checking" card (phase 2) and a `worth_checking` connector tool.

### Phase 9: mobile polish and dark check
- Phone layouts for Overview, Transactions, Budgets, quick add (designs on the canvas).
- Pass through every page in both themes; fix contrast and any hard-coded colours.

### Later
- Two currencies (D6), AI assistant panel changes beyond restyling (D5), Sheets dashboard tab (visualisation §8.6).

## 5. Order and size

| Phase | Depends on | Rough size |
|---|---|---|
| 0 Foundations | — | M |
| 1 Shell | 0 | S |
| 2 Overview | 0, 1 | M |
| 3 Transactions | 0 | M |
| 4 Budgets | 0, 1 | M |
| 5 Reports | 0, 8 (payees) | M |
| 6 Goals & Accounts | 0 | S |
| 7 Import, add, documents, onboarding | 0 | L |
| 8 Worth-checking rules | — (can start in parallel) | M |
| 9 Mobile + dark pass | all | S |

Suggested first PR: phase 0 + phase 1, behind no flag, since they change no numbers.

## 6. Testing

- Unit tests next to the existing ones in `frontend/tests/` for `categoryColors`, `categoryGroups`, each rule in phase 8, and the budget suggestion maths.
- Connector: if `month_summary` starts returning colours or groups, extend `mcp/test/run-tools.mjs`.
- E2E: extend `e2e/dashboard.e2e.ts` with the period switch, theme switch and navigation to `/budgets`.
- Visual check per phase in light and dark, on desktop and phone width, before the next phase starts.

## 7. Open questions

1. ~~D1–D6 above.~~ Approved.
2. Should Insights disappear as a page, or stay under "More" for net worth and forecast?
3. Keep "FinBuddy" as the product name in the sidebar (ux-plan F12), with "aaryaai" as the maker, or show the aaryaai lockup as in the design?
4. Does `TransactionDialog` already support splits? If not, splitting needs a Ledger format change (one row per split, shared group id).
