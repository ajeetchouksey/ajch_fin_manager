# ADR 004: The web app handles data in; the AI app answers questions

Status: Accepted. Recorded 2026-10-16.

## Context
With both a web app and an AI connector, features could end up duplicated or split badly between them. Imports through an AI app would also send statement files to the AI provider.

## Decision
- **Web app:** importing statements (read on the device), correcting and categorising rows, setting up accounts, budgets and goals, and the main dashboards and report. It is the source of truth for figures.
- **AI app:** questions, explanations, analysis, forecasts and recommendations, using the connector's tools. It quotes figures from tools and labels estimates.
- If the two ever disagree on a number, the web app's figure is correct, and the shared logic is fixed.
- The web app offers "ask an AI about this period", which copies a question and opens the AI app beside it.

## Consequences
- Good: statement files never go through an AI provider.
- Good: users without an AI app still have the full product.
- Cost: two surfaces to maintain; the shared logic must stay the only place figures are calculated.
