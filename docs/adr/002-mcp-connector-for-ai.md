# ADR 002: AI apps reach the data through FinBuddy's MCP connector

Status: Accepted. Recorded 2026-10-16.

## Context
Users want to ask questions about their money in the AI app they already use (Claude, Gemini, others). Building an AI chat into FinBuddy would mean FinBuddy sends figures to an AI provider itself, pays for it, and takes on that compliance. AI apps also block being embedded in other sites, so an in-app frame is not possible.

## Decision
- A remote **MCP connector** (`mcp/`, a Cloudflare Worker) exposes FinBuddy tools to any MCP-capable AI app.
- The user connects it in their own AI app. Their AI provider's terms apply to what the AI receives.
- Sign-in uses OAuth with Google `drive.file`; the Google refresh token is kept encrypted in the OAuth grant, and each request carries a short-lived access token. A read-only connection option exists.
- Tools reuse the web app's own logic (`frontend/src/lib`), so the AI and the app report the same figures.
- Writes preview first; deletes need confirmation; IBANs and card numbers are masked in results.

## Consequences
- Good: no AI cost or AI-provider relationship for FinBuddy; users choose their AI.
- Good: one set of calculations for app and AI.
- Cost: the connector is hosted by the developer and passes figures through while answering, so it is in scope for privacy obligations even though it stores no figures.
- Cost: host behaviour differs (for example, Gemini asks permission for each call; interactive views are not yet shown).
- Cost: the connector imports the shared logic by relative path from the frontend; it should become its own package.
