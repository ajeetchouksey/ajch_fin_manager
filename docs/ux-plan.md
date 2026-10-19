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

## Sources

- [procreator.design: best fintech UX practices for mobile apps](https://procreator.design/blog/best-fintech-ux-practices-for-mobile-apps/)
- [onething.design: top 10 fintech UX design practices 2026](https://www.onething.design/post/top-10-fintech-ux-design-practices-2026)
- [Markswebb: onboarding that converts, UX patterns in finance apps](https://markswebb.com/insights/onboarding-ux/)
- [dodopayments: UX strategies for fintech](https://website.dodopayments.tech/blogs/ux-strategies-fintech)
