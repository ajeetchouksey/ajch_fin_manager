# ADR 003: AI-written analysis is stored with figures checked against the ledger

Status: Accepted. Recorded 2026-10-16. Detail: `docs/ai-analysis-spec.md`.

## Context
AI apps can write useful analysis and recommendations, but they can also state figures that are wrong, out of date, or invented. Users want to keep that analysis in FinBuddy and see it in the web app.

## Decision
- AI apps save entries to an **Analysis** tab through `save_analysis`, preview first, then apply after the user agrees.
- Every cited figure of a supported type (money in, money out, net, category spending, savings rate, transaction count, account balance on a date) is **recomputed from the user's ledger** when saved. The entry is marked `yes`, `no` or `not_checked`, and mismatches show the ledger's own value.
- The AI cannot edit transactions or delete entries through this feature; the user marks entries done or dismissed in the web app.
- An entry is flagged as possibly out of date when the ledger has newer transactions.

## Consequences
- Good: users can trust or question a figure at a glance; the check works the same whichever AI wrote it.
- Good: entries stay in the user's Drive.
- Cost: only supported figure types are checked; others are saved as `not_checked`.
- Cost: no automatic saving; every save asks the user, which adds a step.
