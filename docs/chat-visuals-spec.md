# Visuals inside the AI chat: spec

Status: draft for review. Nothing is built yet. Applies to every user.

## 1. Purpose

When a user asks a question such as "how was my month?", the answer appears in their AI app with a chart or table they can interact with, as well as the text. The view uses the same figures as the FinBuddy web app and the same report logic.

## 2. What we know

- **Claude** supports interactive views from connectors through the MCP Apps extension (launched 26 January 2026, per [WorkOS](https://workos.com/blog/2026-01-27-mcp-apps) and [Alpic](https://alpic.ai/blog/mcp-apps-goes-official-claude-chatgpt-support)). Claude requires domain signing for the connector's address.
- **Gemini** support is not confirmed. It shows the connector's tools, but views are unverified.
- **The MCP SDK used by the connector** has general resource handling but no view-specific support. The view has to be added by hand: an HTML resource and a link from the tool to it.
- **Frame restrictions:** Claude and ChatGPT block their pages from being shown in other sites, so views must come from the connector, not from embedding.

## 3. How it works

1. A tool such as `month_summary` returns its normal text and data, plus a link to a view.
2. The view is one self-contained HTML page served by the connector. It makes no outside requests.
3. The AI app shows the view in the chat. The view can call the connector's tools again when the user interacts with it.

Hosts that don't show views still get the text and data, so nothing is lost.

## 4. First views

| Question | View | Interactions |
|---|---|---|
| "How was my month?" | Totals, category bars with change, six-period trend | Switch period, click a category |
| "Show my budgets" | Bars per budget, amber near the limit, red when over | Click a budget to see its payments |
| "What if I save more?" | Forecast line with the estimate dashed, plus drivers | Adjust the saving amount |
| "Monthly report" | Headline, watch list, figures | Save as Google Doc (after confirmation) |

## 5. Rules

1. **Same figures.** Each view uses the same tool outputs and report code as the web app.
2. **Read views are free; changes are not.** Interactions that change data (saving, setting budgets) still need the same confirmation as the tools.
3. **No outside requests.** The view can only call the connector's own tools.
4. **Estimates look like estimates.** Dashed lines, "Est." labels and the basis are shown, as in the web app.
5. **Text always included.** Every answer keeps its text version.
6. **Phone width.** Views must work on a phone screen.
7. **Privacy.** Views show the same figures as the text answer. Payee names appear only on the drill-down, which the user asks for.

## 6. Requirements before building

- **Domain signing** for `mcp.finbuddy.aaryaai.dev`, as Claude requires. This needs the user's Claude account and may need a manual step.
- **A view-capable tool response** in the connector, so the host knows where the view is.
- **A test plan** for Claude and for Gemini separately, since support may differ.

## 7. Testing

- **Connector:** the test harness checks that each view is served and linked from its tool. It can't check how Claude draws the view.
- **Claude:** the user checks each view in a real chat, including an interaction.
- **Gemini:** a short check of whether views appear at all. If they don't, Gemini stays text-only.

## 8. Increments

1. **Protocol check:** serve one static view from the connector and link it from `month_summary`. Verify that the harness sees it. Requires no domain signing.
2. **Domain signing and Claude test:** the user sets up signing, and the month view is checked in Claude.
3. **Interaction:** period switch and category drill-down.
4. **Other views:** budgets, forecast, report.
5. **Gemini check** and decision on Gemini views.

## 9. Risks

| Risk | Note |
|---|---|
| Claude signing is a manual step | Needs the user's account; may delay the test |
| Gemini may not show views | Text fallback keeps it usable |
| Views may load slowly on a phone | Keep each view small and self-contained |
| Figures shown in the chat history | Same as the text answers; drill-downs only on request |
| Host behaviour changes | Keep the view standard and test again after changes |

## 10. Decisions needed

1. **Which view first.** Suggested: the month view.
2. **Interaction level for the first test.** Suggested: period switch only.
3. **Who sets up domain signing.** The user, with help from me on the steps.
