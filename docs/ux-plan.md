# FinBuddy UX: analysis and plan

Status: proposal for review. Based on a code audit of the current web app (October 2026) and a short review of published fintech UX guidance. Not yet tested with real users. A first round of testing with 3 to 5 people is step 0 below.

## 1. Who this is for

- **Primary:** a household member (you, your partner) who wants to know where money goes, stay within budgets, and get a sensible plan without becoming a finance expert.
- **Secondary:** family and friends testing the product, who may not be German or Indian tax experts and may not use an AI app.

## 2. What a first visit looks like today

1. Sign in with Google. The sign-in page explains Drive access in plain words.
2. Connect Google Drive (required; the Ledger is the data store).
3. A quick setup dialog opens (countries, account types, categories). It is a single dialog with several choices.
4. The Overview is shown. With no data it displays an empty state, not guidance on what to do next.
5. To get value, the user must import a statement or add transactions by hand. The import is a multi-step screen.

## 3. Findings

Each finding cites where it was seen in the code, and how severe it is for a new user.

| # | Finding | Where | Severity |
|---|---|---|---|
| F1 | **Eight navigation items, plus two settings pages.** Overview, Accounts, Transactions, Documents, Goals, Insights, Report, Analysis. Several overlap (Overview, Insights, Report and Analysis all show money summaries). | `components/navigation.ts` | High |
| F2 | **Connect Drive before anything else.** Eight pages show a "connect Drive" gate. A new user sees a dead screen until they connect. | `ConnectDrive` used in 8 pages | High |
| F3 | **The import screen mixes numbered and unnumbered steps.** "1. Which column is which?", "2. Add context", then an unnumbered "Balance as on date", then "Rows read", "Already in your Ledger", then "3. Preview". The user can't tell how far through they are. | `components/ledger/ImportDialog.tsx` | High |
| F4 | **The import screen is long and dense.** Eleven form fields across column mapping, context, balance, tags and duplicate settings, all before the user sees a single preview row. | `ImportDialog.tsx` | High |
| F5 | **Empty states don't tell the user what to do next.** Examples: "No transactions yet", "No goals yet", "No documents yet". Only the Overview has a call to action. | empty-state strings across pages | Medium |
| F6 | **Jargon.** Terms such as "Tagesgeld", "Haftpflicht", "Werbungskosten", "Sonderausgaben" appear without explanation, and some are German-only while the rest of the UI is English. | `AccountDialog`, Tax rules, labels | Medium |
| F7 | **Insights and Report have four sections each, with no clear first action.** Users see the score first, but there's no "do this next" prompt that leads somewhere. | `InsightsPage.tsx`, `ReportPage.tsx` | Medium |
| F8 | **The Analysis page is only useful if an AI app has been connected.** Without one, it is an empty page the user is not told how to fill. | `AnalysisPage.tsx` | Medium |
| F9 | **Budgets are a card on the Overview with no first step.** There is an empty state with a "Set budgets" button, but no suggestion of starting values. | `BudgetCard.tsx` | Medium |
| F10 | **Two ways to ask an AI ("Ask an AI about this period") and an AI connector**, but no explanation of what the connector is or how to connect it inside the app. | `AskAI.tsx`, Storage page | Medium |
| F11 | **Permission prompts from Gemini on every call.** Not controlled by the app, but users will read it as the product being annoying. | Gemini behaviour | Medium (outside our control; document it) |
| F12 | **Mixed names.** "FinBuddy", "Aarya" and "AaryaAI Finance" appear in different places (sign-in, manifest, connector). | sign-in page, manifest, connector | Low to medium |
| F13 | **Good**: the Overview's period switch, the "Ask an AI" panel, the report's watch list and the explicit "estimate" labels make the numbers understandable. Keep them. | Overview, Report, Forecast | Strength |

## 4. What guidance says (summary)

From the research, sources are mostly vendor and agency writing, so treat these as hypotheses to test, not facts:

- **Show value before asking for more.** Let people see something useful early, before identity or setup steps are finished. Source: [procreator.design, best fintech UX practices](https://procreator.design/blog/best-fintech-ux-practices-for-mobile-apps/).
- **Stage the form.** Ask for information in small steps with live validation. Source: [onething.design, top 10 fintech UX practices 2026](https://www.onething.design/post/top-10-fintech-ux-design-practices-2026).
- **Explain why a sensitive thing is asked.** Short reasons next to a request reduce anxiety. Source: [Markswebb, onboarding UX patterns in finance apps](https://markswebb.com/insights/onboarding-ux/).
- **Preview with simulated data** before the user has connected anything. Source: [Markswebb](https://markswebb.com/insights/onboarding-ux/).
- **Plain, friendly microcopy** for security and data requests. Source: [Markswebb](https://markswebb.com/insights/onboarding-ux/).
- **Tailor the path to the user's goal**, so irrelevant steps are skipped. Source: [Markswebb](https://markswebb.com/insights/onboarding-ux/).
- **Make fees and trust visible early**, and show security at the points where people decide. Source: [dodopayments, UX strategies for fintech](https://website.dodopayments.tech/blogs/ux-strategies-fintech).

Gap in the research: nothing found on how budgeting apps set up their first budget, or on measured results. Step 0 below covers that.

## 5. Plan

### Step 0: test before changing (1 week)
- Recruit 3 to 5 people who fit section 1, one of them with no finance background.
- Watch each one go from sign-in to their first useful number, without help. Note every pause and question.
- Record the time to first useful number, and the number of steps.
- Success measure for the rest of this plan: **a new user reaches a first useful number in under 10 minutes, without help.**

### Step 1: a clear first path (highest impact, low risk)
- **One "Start here" checklist** on the Overview, replacing the empty state: Connect Drive → Add your accounts → Import a statement → Set a budget. Each item shows done or not done, and links to its screen.
- **Show a preview with example data** before Drive is connected, clearly labelled as an example (F2, F5). Source: Markswebb preview pattern.
- **Reduce the navigation** from eight items to five: Overview, Money (Transactions, Accounts, Documents together), Plan (Goals, Budgets), Insights (Insights, Report), Assistant (Analysis, AI connection, Ask an AI). Keep the existing pages; change only the menu grouping (F1).

### Step 2: make import feel safe and short (F3, F4)
- Number every step, with a progress indicator: 1 Choose file, 2 Check columns, 3 Review rows, 4 Confirm. Move the balance question into step 3, where it's relevant.
- Hide optional fields behind "More options" (tags, notes, duplicate settings, date format), with sensible defaults.
- Show the first preview row before asking for any optional setting.

### Step 3: say what to do next, everywhere (F5, F7, F8, F9)
- Every empty state gets one clear action and one sentence explaining why it matters.
- Insights and Report each end with a single "Next step" card, linking to the screen that fixes the top gap.
- Budgets: offer starting values from the last three months' averages per category, editable before saving (F9).
- Analysis: when no AI app is connected, the page explains how to connect one and what it will do, with a link.

### Step 4: plain words, one name (F6, F10, F12)
- A short glossary: each German or Indian term gets a one-line explanation on hover or tap, and an English label next to it.
- One product name everywhere ("FinBuddy"), including the sign-in page and manifest.
- The AI connection gets its own short explanation on the Storage page: what it is, what data it sees, how to disconnect.

### Step 5: explain permissions and trust at the point of need (F11)
- A short notice before Drive connection, and before the AI connection, saying what it can see and how to remove it.
- Document the Gemini permission behaviour in the help text: Gemini asks for each call, and that is Gemini's setting.

### Step 6: measure and iterate
- Repeat the step 0 test after steps 1 to 3.
- Track in the app (opt-in, no personal figures): where users stop in the first session.

## 6. Open questions for you

1. **Connect Drive first or later?** The current setup needs Drive before anything. Option: show a sample Overview first, and connect Drive when the user wants to save their own data. This is a trade-off between speed and clarity about where data goes.
2. **Navigation grouping:** the five-item grouping above, or keep eight?
3. **Glossary depth:** German terms only for Germany and Indian terms only for India, or always both?
4. **Who tests in step 0?** Family, friends, or people outside your circle?

## 7. What this plan does not change

- The data model, the Ledger, the AI connector and the figures. These are stable and tested.
- The explicit "estimate" labels and the confirmation rules for AI-proposed changes. These support trust and should stay.

## 8. Adding, removing and other views: audit and plan

This section looks at everyday actions from the user's side: adding data, removing it, fixing mistakes, and reading views. It is based on the code (October 2026) and a short review of finance and SaaS guidance. Like the rest of this document, it is a hypothesis to test in step 0.

### 8.1 What exists today

| Action | How it works now | Where | User-side problem |
|---|---|---|---|
| Add a transaction | A form with a type switch, amount, currency, date, category, description, account, notes, tags and documents. About 19 fields across modes. | `TransactionDialog.tsx` | Long for a quick entry such as a coffee. No "same as last time" option. |
| Import a statement | Multi-step, described in section 3 (F3, F4). | `ImportDialog.tsx` | Long, and undo is not in the app. |
| Edit a transaction | Open the transaction, then edit in the form. One at a time. | `TransactionDetails.tsx`, `TransactionDialog.tsx` | No way to change many at once, for example recategorising every "REWE" payment. |
| Delete a transaction | Delete, then confirm inline ("Delete this transaction from your Ledger?"). Permanent. | `TransactionDetails.tsx` | The confirmation is clear, but there is no undo and no trash. |
| Undo an import | **Not in the app.** Available only through the AI connector (`undo_import`). | connector only | A wrong import of 200 rows can only be fixed by asking an AI app, or by hand. |
| Add an account | Dialog from the Accounts page: name, type, institution, balance, rate, monthly amount, notes. | `AccountDialog.tsx` | Reasonable. The balance "as on" date matters and is easy to miss. |
| Remove an account | Confirm inline. Its transactions stay in the Ledger, marked with the old label. | `AccountDialog.tsx` | The user is not told what happens to its payments. |
| Add a goal | Dialog. Linking to an account changes how it counts. | `GoalDialog.tsx` | Clear, but the effect of the link is explained only in small text. |
| Remove a goal | Two clicks: "Remove", then "Yes, remove". | `GoalDialog.tsx` | No undo. Acceptable for goals. |
| Upload a document | Dialog with a file, type, date and notes. Can be attached to one transaction. | `UploadDocumentsDialog.tsx` | Good. |
| Remove a document | **Not possible in the app.** The delete function exists in the data layer, but no screen uses it. | `LedgerContext.tsx` (unused) | A mistaken upload stays forever. This is a real gap. |
| Bulk edit | **Does not exist.** | none | Recategorising many payments means opening each one. |
| Budgets | Set in a dialog from the Overview. Changed or removed one at a time. | `BudgetDialog.tsx` | Fine for a few categories. |
| Analysis entries | Mark done, dismiss, reopen. Cannot be removed. | `AnalysisPage.tsx` | Dismissed items pile up, with no way to clear them. |

Views:

| View | Question it answers | Problem |
|---|---|---|
| Overview | "How am I doing this month?" | Seven sections with no ranking. The most important figure is not highlighted. |
| Transactions | "What did I spend on X?" | Search and filters exist, but there is no quick "show this category" from a chart. |
| Insights | "What should I fix?" | Four sections. The detail is there, but the first action is not. |
| Report | "What changed, and why?" | Good structure. It reads like a document, so it suits sharing, not the everyday check. |
| Analysis | "What did my AI app say?" | Useful only after an AI app has been connected (F8). |

### 8.2 What the research says

- **Reversibility decides the pattern.** If an action can be undone or restored, an undo message is enough. If it cannot, ask first. [UX confirmation dialogs, undo windows and soft delete](https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj); [SaaS destructive actions](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns).
- **Friction should match the damage.** A blanket "Are you sure?" trains people to click through. Reserve heavy confirmation for permanent, wide-reaching actions. [SaaS destructive actions](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns).
- **Soft delete with a visible trash.** A common default is to delete into a trash for a set period, with an undo message. The trash has to be visible, or nobody uses it. [Delete models in products](https://uxdesign.cc/delete-models-in-products-because-sometimes-cats-walk-on-keyboards-6f886b767f6d); [GitLab, standardising deletion](https://gitlab.com/gitlab-org/gitlab/-/issues/541182).
- **Undo must last long enough.** Users of a finance app said the undo prompt after a bulk recategorisation disappeared too fast, and asked for a restore point rather than a single step. [Simplifi community: undo option](https://community.simplifimoney.com/discussion/2289/undo-option).
- **Bulk edits need a preview and an undo.** One pattern: a review step where the user unticks individual items, then a confirmation with an undo for about ten seconds. [Origin: undoing a bulk transaction edit](https://support.useorigin.com/hc/en-us/articles/41981789469069-Can-I-undo-a-bulk-transaction-edit).
- **Without undo, users start over.** Accounting software without undo for categorisation pushes users to delete and re-enter, which is slower and riskier. [QuickBooks community](https://quickbooks.intuit.com/community/banking-4/how-to-undo-categorized-transactions-in-the-quickbooks-desktop-23446).
- **Confirmation wording matters.** Say what will happen, and how many things it affects. [Microcopy for confirmation dialogues](https://uxdesign.cc/are-you-sure-you-want-to-do-this-microcopy-for-confirmation-dialogues-1d94a0f73ac6).

Gap in the research: nothing on the speed of manual entry in finance apps, such as repeating the last entry. Step 0 observation covers that.

### 8.3 Findings

| # | Finding | Severity |
|---|---|---|
| U1 | **Documents cannot be removed.** A mistaken upload is permanent. The data function exists, but no screen uses it. | High |
| U2 | **No undo for an import anywhere in the app.** The connector can undo it, but most users will not use the connector for that. | High |
| U3 | **No way to change many transactions at once.** The most common cleanup, recategorising recurring payees, is one at a time. | High |
| U4 | **Deletes have no trash and no undo.** Confirmation is good, but a slip is permanent. | Medium |
| U5 | **Adding a regular payment is slow.** Nineteen fields, with no "repeat the last one" or "recurring" option. | Medium |
| U6 | **Removing an account does not say what happens to its payments.** They stay in the Ledger, labelled with the old name. | Medium |
| U7 | **Dismissed analysis entries pile up**, with no way to clear them. | Low |
| U8 | **The Overview ranks nothing.** The user's first question, "how am I doing", is spread over seven sections. | Medium |
| U9 | **The Report reads as a document**, so it fits sharing but not the everyday check. A short daily view is missing. | Low |

### 8.4 Plan

**Priority 1: stop permanent mistakes (U1, U2, U4)**
- **Documents:** add a remove action, with a confirmation that names the document and says it is kept for 30 days in a visible "Removed" list, where it can be restored. The app only unlinks the Drive file and never deletes it, which matches the existing rule.
- **Undo for imports, in the app:** after an import, a banner for 30 seconds with "Undo import". Then a "Recent imports" list for a day, each with an undo. This uses the existing `created_at` batch, so no data changes are needed.
- **Deletes:** transactions go to a visible "Recently removed" list for 30 days, with restore. Permanent deletion happens only from that list.

**Priority 2: fix cleanup, the biggest daily pain (U3, U5)**
- **Bulk recategorise from the list:** select rows, choose a category, review every row in a list where each can be unticked, then apply with a 10-second undo. Start with "same payee" as the selection shortcut, since that is the common case.
- **"Make this a rule"** after a recategorise: optional, and visible in settings, so future imports follow it. Categorisation rules already exist in the engine; this exposes them.
- **Quick add:** the form opens on the last used account, today's date and the last category used for that payee. Fields beyond amount, category and description move behind "More".

**Priority 3: say what happens (U6, U7)**
- **Remove an account:** show how many payments are attached, and offer to move them to another account or keep them labelled, before confirming.
- **Analysis:** a "Clear dismissed" action that moves them to a collapsed list, not a delete.

**Priority 4: views built from the user's question (U8, U9)**
- **Overview:** one headline card at the top, "Left over this month: X (Y% of money in)", then the three most useful next items. The seven sections stay below, collapsed by default.
- **A short daily check:** a "This week" view with the week's money in and out, new payees, and anything still to categorise. The Report stays for sharing.
- **Consistency:** every view uses the same period switch, so the user does not relearn it on each page.

**Success measures for this section (after step 0 testing)**
- A wrong import can be undone in under 30 seconds, without help.
- Recategorising 20 payments takes under a minute.
- A mistaken document upload can be removed and restored.

### 8.5 Questions for you

1. **Trash length:** 30 days, or shorter? A longer trash is safer but holds more personal data for longer.
2. **Bulk recategorise:** start with "same payee" only, or also "same category" and "date range"?
3. **Rules:** should "make this a rule" be on by default, or asked each time?

## Sources

- [procreator.design: best fintech UX practices for mobile apps](https://procreator.design/blog/best-fintech-ux-practices-for-mobile-apps/)
- [onething.design: top 10 fintech UX design practices 2026](https://www.onething.design/post/top-10-fintech-ux-design-practices-2026)
- [Markswebb: onboarding that converts, UX patterns in finance apps](https://markswebb.com/insights/onboarding-ux/)
- [dodopayments: UX strategies for fintech](https://website.dodopayments.tech/blogs/ux-strategies-fintech)
- [UX confirmation dialogs, undo windows and soft delete](https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj)
- [SaaS destructive actions: confirmation UX patterns](https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns)
- [Delete models in products](https://uxdesign.cc/delete-models-in-products-because-sometimes-cats-walk-on-keyboards-6f886b767f6d)
- [GitLab: standardising the deletion experience](https://gitlab.com/gitlab-org/gitlab/-/issues/541182)
- [Simplifi community: undo option](https://community.simplifimoney.com/discussion/2289/undo-option)
- [Origin: undoing a bulk transaction edit](https://support.useorigin.com/hc/en-us/articles/41981789469069-Can-I-undo-a-bulk-transaction-edit)
- [QuickBooks community: undoing categorised transactions](https://quickbooks.intuit.com/community/banking-4/how-to-undo-categorized-transactions-in-the-quickbooks-desktop-23446)
- [Microcopy for confirmation dialogues](https://uxdesign.cc/are-you-sure-you-want-to-do-this-microcopy-for-confirmation-dialogues-1d94a0f73ac6)
