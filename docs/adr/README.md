# Architecture decision records

Short records of decisions that shape FinBuddy. Each says what was decided, why, and what it costs. A decision that changes later gets a new record that supersedes the old one; old records are not rewritten.

| # | Decision | Status |
|---|---|---|
| [001](001-data-in-users-drive.md) | Each user's data lives in a Google Sheet in their own Drive | Accepted |
| [002](002-mcp-connector-for-ai.md) | AI apps reach the data through FinBuddy's MCP connector | Accepted |
| [003](003-ai-analysis-with-checked-figures.md) | AI-written analysis is stored with figures checked against the ledger | Accepted |
| [004](004-web-app-and-ai-roles.md) | The web app handles data in; the AI app answers questions | Accepted |

Code comments that cite "ADR-001" refer to record 001.
