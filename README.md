# Finance Manager (local app)

Your personal finance cockpit for Germany + India. Runs **only on this laptop** — data lives in `app/data/finance.db`.

## Start it
1. First time only: double-click **`install.bat`** (needs Python 3.10+ from python.org, "Add to PATH" ticked).
2. Every time: double-click **`start.bat`** → your browser opens http://127.0.0.1:8770
3. Stop it: close the black window.

## What each tab does
| Tab | Question it answers |
|---|---|
| **Position** | Where do I stand? Net worth in €, what's in rupees vs euros, Gera flat progress, next deadlines. |
| **Goals** | How much must I save per month for each goal, and am I on track? |
| **Plan** | Money in vs out, savings rate, emergency cushion, a plain-English to-do order. |
| **Invest** | What I hold (ETFs, MFs, stocks, EPF…), gains, allocation. Live prices via Yahoo tickers. |
| **Learn & paper-trade** | Backtest trading rules on 10+ years of data; practise with €10,000 fake money; Sparplan simulator. **No real orders, ever.** |
| **Tax** | 🇩🇪+🇮🇳 compliance calendar (seeded from your TDS tracker), German refund estimator, India old-vs-new regime, German investment-tax calculator, cross-border checklist. |

## Documents from Google Drive (optional)
The Documents tab can read from a Google Drive folder instead of this laptop.
1. **One-time Google setup** (each user does this with their own Google account): at console.cloud.google.com create a project → enable **Google Drive API** → **OAuth consent screen**: External, add your Gmail as a test user → **Credentials → Create OAuth client ID → Desktop app** → download the JSON.
2. In the app: **Settings → Google Drive** → paste the JSON → **Connect Google Drive** → sign in → paste your Drive folder link → **Sync now**.
3. Tick **Use Google Drive as the document source**. The Documents tab, the misfiled-document review, payslip/invoice/TDS extraction and the planner numbers now come from Drive. Use **Sync Drive** on the Documents tab after adding files in Drive.

How it works: files are copied into `data/gdrive_cache/` (git-ignored) so everything runs offline between syncs; documents you add in the app are uploaded to the matching Drive sub-folder, and moves are mirrored. Nothing is deleted in Drive. The sign-in token stays in `data/finance.db`. Untick the box (or Disconnect) to go back to local files.

## Where the numbers come from
- **Your entries** in the app (accounts, holdings, goals, spending).
- **`../facts/*.json`**, produced by `python tools/planner.py all .` from your payslips, Gera invoices and TDS challans. Routes were updated for the new `3_Milestones/` and `4_TDS/` folders.
- **Tax rules**, verified 30 Sep 2026: §32a EStG tariffs 2023–2026 (continuity-checked at every bracket edge), Soli thresholds, Indian slabs FY 2025-26/2026-27 (new & old regime, 87A for residents only, surcharge, 4% cess, equity CG 20%/12.5% above ₹1.25L).

## Reference projects this borrows ideas from
- **Ghostfolio**: multi-currency net worth & allocation
- **Portfolio Performance**: German-market portfolio maths, broker imports (future)
- **Firefly III / Actual Budget**: budgeting categories
- **backtesting.py / vectorbt / backtrader**: backtest engine design (re-implemented small in `fincore/trading.py`)
- **casparser**: Indian mutual-fund CAS import (next step)

## Tests
`python -m pytest tests` checks tax slabs, rebates, goal maths, backtest and paper-account accounting.

## Roadmap (next)
1. Import bank CSVs (Deutsche Bank, Indian bank `.xls`) → auto-fill the Plan tab.
2. Import CAMS/KFintech CAS PDF (via `casparser`) → Indian MFs in Invest.
3. Broker CSV import (Trade Republic / Scalable / comdirect).
4. Payslip tax-box extraction → auto-fill the German refund estimator.
5. AI "advisor" step: reads `facts/` + app DB, writes monthly insights (per ARCHITECTURE.md).

> Estimates only. For filings, corrections and anything with a penalty attached, confirm with a Steuerberater / Chartered Accountant.
