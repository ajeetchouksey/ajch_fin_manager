# FinBuddy connector (MCP)

Lets users work with their FinBuddy Ledger from **their own AI app**: Claude (desktop, web, mobile), ChatGPT, or any app that supports remote MCP connectors. They can import a statement, add or fix payments, ask about their spending, or get a full review with gaps and a forecast, all by chatting. Changes land in the same Ledger Sheet in their Google Drive that the FinBuddy web app uses.

The user's AI subscription does the thinking, so FinBuddy pays for no AI usage.

## How it works

```
AI app ──MCP (OAuth)──▶ this Worker ──Google Sheets/Drive API──▶ user's Ledger in their Drive
```

- **Sign-in:** this Worker is the OAuth server for MCP clients ([`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider)). Users approve the app on FinBuddy's consent page, then sign in with Google.
- **Permission:** Google scope `drive.file` only, so FinBuddy sees only the files it created, never the rest of the user's Drive. It uses the **same Google OAuth client** as the web app, so the connector can see the Ledger the web app created.
- **Read-only option:** on the consent page the user can untick "Make changes" to connect read-only.
- **Staying connected:** the Google refresh token is kept in the OAuth grant, encrypted by the library with a key only the client's token unwraps. Each MCP request carries only a short-lived Google access token. A connection lasts while it is used and ends after 90 idle days (or a year at most). Removing FinBuddy at myaccount.google.com/connections ends it at the next refresh.
- **One source of truth:** tools import the web app's code from `frontend/src/lib` (Ledger client, statement reader, categoriser, review engine).
- **Stateless:** `createMcpHandler` from `agents/mcp` with MCP SDK v2; no Durable Objects.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `ledger_status` | Where the Ledger is and what it holds | no |
| `create_ledger` | Creates the FinBuddy folder and Ledger if missing | yes |
| `financial_review` | Score, net worth, cash flow, regular payments, goals, forecast, gaps with next steps | no |
| `forecast_what_if` | Forecast with extra saving or spending, or a one-off | no |
| `find_transactions` | Search with totals; returns ids | no |
| `spending_breakdown` | Totals by category, month, account or payee | no |
| `list_accounts_and_goals` | Accounts and goals with ids | no |
| `add_transactions` | Add 1–200, auto-categorised, duplicates skipped | yes |
| `import_statement` | CSV statement: preview first (`apply=false`), then save | yes |
| `update_transactions` | Edit or re-categorise up to 500 in one request | yes |
| `delete_transactions` | Needs `confirm: true`; marked destructive | yes |
| `save_account`, `delete_account` | Accounts, investments, pension, loans, cards, insurance | yes |
| `save_goal`, `delete_goal` | Savings goals | yes |

IBANs and card numbers are masked in everything sent back to the AI app.

## Setup (one time)

1. **Google Cloud console** → APIs & Services → Credentials → the web app's OAuth client (`939308613423-…`) → *Authorized redirect URIs* → add `https://mcp.finbuddy.aaryaai.dev/callback` (and `http://localhost:8788/callback` for local testing).
2. **KV namespace** for OAuth grants:
   ```bash
   cd mcp && npx wrangler kv namespace create OAUTH_KV
   ```
   Put the printed id into `wrangler.jsonc` (`REPLACE_WITH_OAUTH_KV_ID`).
3. **Secret** (the same client secret the main Worker uses):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
4. **Deploy**: `npm run deploy`. It is served on the custom domain `mcp.finbuddy.aaryaai.dev` (change `PUBLIC_URL` and `routes` together if you use another).
5. **Connect**: in Claude, Settings → Connectors → *Add custom connector* → `https://mcp.finbuddy.aaryaai.dev/mcp`. In ChatGPT, Settings → Apps & Connectors → *Create*, same URL.

## Develop and test

```bash
npm install
npm run type-check
```

Tool tests run every tool end to end against an in-memory fake of the Google APIs (no Google account needed):

```bash
npm run dev:test        # terminal 1: test harness on :8799
npm run test:tools      # terminal 2
```

To try the OAuth pages locally, copy `.dev.vars.example` to `.dev.vars`, then run `npm run dev`. Discovery URLs only line up when you open the connector at the exact `PUBLIC_URL` (`http://localhost:8788`).

## Privacy notes for the privacy notice

- Data read by a tool passes through this Worker to the AI app the user chose, to answer their request. It is not stored by FinBuddy.
- Stored: OAuth grant records in Cloudflare KV (tokens hashed; user properties, including the Google refresh token, encrypted).
- The AI app's own terms apply to what it receives. Users choose and authorise that app themselves.
