# AI analysis in FinBuddy: spec

Status: approved for build (increment 1 in progress). Applies to every user, not one ledger.

## 1. Purpose

Let any AI app a user connects (Claude, Gemini, or another MCP app) add analysis, recommendations, projections and data-quality notes to the user's own Ledger. The web app shows them. The user stays in control of what gets saved.

## 2. What is stored

A new **Analysis** tab in every user's Ledger, created the same way as the Budgets tab.

| Column | Meaning |
|---|---|
| id | Unique id (the row key) |
| kind | `analysis`, `recommendation`, `projection`, `data_issue`, `categorisation` |
| title | Short title, in the language the user writes in |
| body | The text |
| period_start, period_end | The period the entry is about (may be empty) |
| figures | JSON list of the figures cited: name, value, the tool and inputs they came from |
| verified | `yes`, `no` (a figure did not match the ledger), or `not_checked` |
| status | `open`, `done`, `dismissed` |
| written_by | The AI app name, or "unknown" |
| created_at | When it was saved |
| ledger_as_of | The latest transaction time when it was saved (for staleness) |

Columns are appended to the end of the tab. Existing user data is never changed.

## 3. Rules

1. **Preview first.** `save_analysis` returns what would be saved, including the verification result. It writes only when called with `apply: true`.
2. **Figures are checked.** Each cited figure is recomputed from the user's ledger for its period. A figure that differs by more than 0.01 makes the entry `verified: no`, and the mismatch is shown. The entry can still be saved so the user can judge it.
3. **Only supported figure types** can be verified at first: money in, money out, net, and spending by category, for a period. Other figures are saved as `not_checked`.
4. **No changes to transactions.** The AI cannot edit or delete transactions through this feature.
5. **Nothing is deleted by the AI.** Only the user can remove an entry, in the web app.
6. **Staleness.** An entry is flagged "may be out of date" when the ledger has newer transactions than `ledger_as_of`.
7. **Disclaimer.** Recommendations carry the line: general guidance, not regulated financial advice.
8. **Privacy.** Entries are stored in the user's Drive only. Masking rules for IBANs and card numbers apply to the text as they do elsewhere.

## 4. Connector tools

- `save_analysis` (write): kind, title, body, period, figures, `apply` (default false). Returns the preview, verification result and what would be saved.
- `list_analysis` (read): filter by kind, status, period.

## 5. Web app

- An **Analysis** page for every user, in navigation.
- Grouped by kind, newest first. Each entry shows its verification status, the figures and their sources, the AI app that wrote it, and whether it may be out of date.
- Actions: mark done, dismiss, or reopen. No delete in the first version.

## 6. Out of scope (first version)

- Automatic saving without confirmation, including "trusted kinds".
- Visuals inside the AI chat (a separate piece of work).
- Verification of figures other than the supported types.

## 7. Increments

1. Spec, data model and verification logic, with tests.
2. Connector tools `save_analysis` and `list_analysis`, with harness tests.
3. Web app Analysis page: list, verification and staleness display, done and dismiss.
4. Extend verification to more figure types, and add a user setting for trusted kinds, if wanted.
