# ADR 001: Each user's data lives in a Google Sheet in their own Drive

Status: Accepted. Recorded 2026-10-16 (the decision predates this record; code already cites it).

## Context
FinBuddy handles personal financial data: transactions, balances, goals, household details. The developer wants to hold as little of it as possible, so that family and friends can test without their data sitting on someone else's servers, and so users can keep and move their own data.

## Decision
- Each user's data lives in a **Ledger**: a Google Sheet in a FinBuddy folder in their own Google Drive.
- The app asks only for `drive.file`, so it can see only the files it creates.
- Tabs: Transactions, Documents, Accounts, Balances, Goals, Budgets, Analysis, Profile, Meta. Columns are only ever appended at the end, so older Ledgers keep working.
- The web app reads and writes the Ledger directly from the browser. The connector reads and writes it on the user's behalf with their own Google token.
- The financial profile is kept in the Ledger's Profile tab (moved from the server database in October 2026).

## Consequences
- Good: the user owns and can export their data; the developer's servers hold no figures or profile.
- Good: works on any device with a browser; no database to run for user data.
- Cost: Sheets is not a database. No transactions, every read loads a whole tab, and writes rely on row numbers checked against ids. Fine at hundreds to low thousands of rows; it will need care beyond that.
- Cost: schema changes have to be applied to every existing Ledger. Today new tabs are added on load, but new columns on existing tabs are not migrated automatically.
- Cost: amounts are stored as decimal numbers, not whole cents.
- Remaining server state: the sign-in token exchange runs on the root Worker, and the connector keeps encrypted sign-in tokens. Neither stores financial data.
