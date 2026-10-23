/**
 * Prompts people can give their own AI app to think through goals and investing.
 * They hold none of the person's numbers. With the FinBuddy connector the AI reads the Ledger itself;
 * without it, the AI is told to ask. They name no products and ask the AI to leave the decision to the person.
 */

export interface AiPrompt {
  id: string
  title: string
  /** When this is useful, one sentence */
  when: string
  group: 'goals' | 'risk' | 'review'
  /** The request itself, without the shared opening and closing */
  body: string
}

export const PROMPT_GROUPS: Array<{ id: AiPrompt['group']; label: string }> = [
  { id: 'goals', label: 'Plan a goal' },
  { id: 'risk', label: 'Understand risk' },
  { id: 'review', label: 'Review and prepare' },
]

export const AI_PROMPTS: AiPrompt[] = [
  {
    id: 'goal-strategy',
    group: 'goals',
    title: 'Think through one goal',
    when: 'You have a goal with a target and a date and want to see the ways to get there.',
    body:
      'Pick the goal I care about most (ask me which if it is not obvious). Show how much I would need to put aside each month to reach it, ' +
      'under three cases: no growth, a modest return and a stronger return. For each case give a range, not a single number, and say what would have to be true. ' +
      'Then list two or three different approaches (for example saving more, waiting longer, or accepting more risk) with the trade-off of each.',
  },
  {
    id: 'contribution-plan',
    group: 'goals',
    title: 'How much to set aside each month',
    when: 'You want to compare what you could afford with what your goals need.',
    body:
      'Compare what I could realistically set aside each month, based on my income and spending, with what my goals together need. ' +
      'Tell me whether they fit, where they clash, and which goal to adjust first if they do not. Keep an emergency buffer in mind and say how large it should be for my situation.',
  },
  {
    id: 'stress-test',
    group: 'risk',
    title: 'What if things go wrong',
    when: 'You want to know how a market fall or a gap in income would affect your plan.',
    body:
      'Test my plan against three situations: my investments fall by a third, my income stops for six months, and a large unplanned expense of about three months of spending. ' +
      'For each, tell me what happens to my goals and my buffer, and what I would have to change. Be clear about what is an estimate.',
  },
  {
    id: 'risk-check',
    group: 'risk',
    title: 'Check my three kinds of risk',
    when: 'You want to see whether what you can afford, what you can stomach and what you need agree.',
    body:
      'Look at my risk in three separate parts: the ability to take a loss (my buffer, income stability and time horizon), my willingness (my own answers, if I have given any) ' +
      'and the need (the return my goals require). Say where they disagree and what that means in plain words. If one of the three is missing, ask me for it before concluding.',
  },
  {
    id: 'explain-plainly',
    group: 'risk',
    title: 'Explain it plainly',
    when: 'A term or idea in your plan is unclear.',
    body:
      'Take the main ideas in my plan that a beginner might not know (for example volatility, time horizon, diversification, inflation, costs) and explain each in two sentences, ' +
      'using my own numbers as the example where you can. Do not use jargon without explaining it.',
  },
  {
    id: 'review-investments',
    group: 'review',
    title: 'Review what I hold',
    when: 'You want a calm look at your investments against your goals.',
    body:
      'Review the investment and retirement accounts I have against my goals. Tell me how much of my money is in each kind of account, whether it matches the time each goal has, ' +
      'and anything that looks out of line (too much in one place, money meant for soon held for the long term, or the reverse). Describe kinds of holdings in general terms only.',
  },
  {
    id: 'adviser-questions',
    group: 'review',
    title: 'Prepare for an adviser meeting',
    when: 'You are about to talk to a financial adviser or tax adviser.',
    body:
      'Prepare me for a meeting with a financial adviser. Summarise my situation in one page (income, spending, accounts, goals, buffer), ' +
      'list what is unclear or missing in my records, and write ten good questions I should ask, including how they are paid and what the costs would be.',
  },
]

const OPENING_CONNECTED =
  'I use FinBuddy for my personal finances. Use the FinBuddy tools to read my accounts, goals, budgets and spending (start with ledger_status and list_accounts_and_goals), and use only the figures they return.'
const OPENING_PLAIN =
  'I use FinBuddy for my personal finances, but you cannot read it. Before you answer, ask me for the figures you need (accounts, goals, income, spending) and use only what I tell you.'
const CLOSING =
  'Ground rules: this is general information, not regulated advice. Show your assumptions and give ranges rather than promises. Do not name or recommend specific products, funds or providers. ' +
  'Say plainly what I should decide for myself and what a professional should check. If something is missing, ask me instead of guessing.'

/** The full text to give an AI app. `connected` is true when the AI can read the Ledger through the FinBuddy connector. */
export function promptText(prompt: AiPrompt, connected: boolean): string {
  return `${connected ? OPENING_CONNECTED : OPENING_PLAIN}\n\n${prompt.body}\n\n${CLOSING}`
}
