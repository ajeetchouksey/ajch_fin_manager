# FinBuddy

A personal finance tool for you and your household. Your money data stays in a Google Sheet (the **Ledger**) in your own Google Drive. A web app imports statements, shows where money goes, tracks budgets and goals, and gives a cautious forecast. An optional connector lets your own AI app (Claude, Gemini, others) answer questions from the same figures.

## How it fits together

| Part | Folder | Runs on | Does |
|---|---|---|---|
| Web app | `frontend/` | Cloudflare Pages (installable PWA) | Import statements (read on the device), categorise, budgets, goals, Overview, Insights, Report, Analysis. Reads and writes the Ledger straight from the browser. |
| Shared logic | `frontend/src/lib/` | Used by both apps | Periods, totals, budgets, forecast, report, analysis checks, Drive client. Must not import from the app (a test enforces this). The connector imports it as `@finbuddy/core`. |
| AI connector | `mcp/` | Cloudflare Worker | MCP tools for AI apps, with its own Google sign-in. Reads and writes the user's Ledger. |
| Sign-in Worker | `src/` | Cloudflare Worker | Exchanges the Google sign-in code for tokens. Its older routes (onboarding, AI) are being retired. |

The Ledger is a Google Sheet with tabs for Transactions, Documents, Accounts, Balances, Goals, Budgets, Analysis, Profile and Meta. The app asks only for `drive.file`, so it sees only the files it creates. See [ADR 001](docs/adr/001-data-in-users-drive.md).

## Run it locally

Web app:
```bash
cd frontend && npm ci && npm run dev
```
Needs `frontend/.env.local` with `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL` (see `frontend/.env.example`).

AI connector:
```bash
cd mcp && npm ci && npm run dev
```
Needs `mcp/.dev.vars` (see `mcp/.dev.vars.example`). Setup and deployment: [mcp/README.md](mcp/README.md).

Sign-in Worker:
```bash
npm ci && npm run dev
```

## Tests

| What | Command |
|---|---|
| Shared logic and web app | `cd frontend && npm test` |
| Connector tools (against an in-memory Google fake) | `cd mcp && npm run dev:test`, then in a second terminal `cd mcp && npm run test:tools` |
| Sign-in Worker unit tests | `npx jest src/__tests__/schema-delete.test.ts src/__tests__/auth-flags.test.ts` |

Start a fresh `dev:test` harness for each connector test run; the harness keeps state between runs.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: type-checks and tool tests, then deploys the sign-in Worker, the web app to Cloudflare Pages, and the connector, with health checks after each.

## Decisions and plans

- Architecture decisions: [docs/adr/](docs/adr/README.md)
- Specs: [AI analysis](docs/ai-analysis-spec.md), [visuals inside the AI chat](docs/chat-visuals-spec.md), [visualisation alignment](docs/visualization-alignment.md), [AI assistant plan](docs/ai-assistant-plan.md)
- Older documents (previous architectures): [docs/history/](docs/history/README.md)

## Privacy in one paragraph

Financial data and the profile live in the user's Drive. The web app talks to Google directly. The connector holds encrypted sign-in tokens and passes figures through to the user's chosen AI app while answering, but stores no figures. Answers in an AI app fall under that provider's terms. This is a design summary, not legal advice.

## Earlier version

The original local Python app (`server.py`, `fincore/`, `static/`) was retired in October 2026. It is kept on the `archive/python-app` branch, including its German and Indian tax calculations, which the current app does not have yet.
