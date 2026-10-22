import { useState } from 'react'
import { Check, Copy, ExternalLink, MessageSquare } from 'lucide-react'

/**
 * Opens an AI app next to FinBuddy with a ready question. Prefilling a question from a link isn't
 * reliable (neither Claude nor Gemini documents it), so the question is copied to the clipboard and
 * the app is opened. Paste it into the chat.
 */
const APPS = [
  { label: 'Claude', url: 'https://claude.ai/new' },
  { label: 'Gemini', url: 'https://gemini.google.com/app' },
] as const

export function AskAI({ period }: { period: string }) {
  const questions = [
    `How was ${period}? Use FinBuddy's month summary and tell me the main changes.`,
    `What should I look at for ${period}? Use the monthly report and budgets, and say which figures are estimates.`,
  ]
  const [copied, setCopied] = useState<string | null>(null)

  const openWith = async (question: string, url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(question)
      setCopied(label)
      window.setTimeout(() => setCopied(null), 2500)
    } catch {
      /* clipboard blocked: the app still opens, and the question is printed on the card to copy by hand */
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section aria-labelledby="ask-heading" className="card px-5 py-4 sm:px-6">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand-soft" aria-hidden />
        <h3 id="ask-heading" className="text-sm font-semibold text-ink">Ask an AI about this period</h3>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        The question is copied when you pick an app. Paste it into the chat, and keep FinBuddy open beside it.
      </p>
      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 flex-1 text-sm text-slate-200">{q}</p>
            <div className="flex shrink-0 gap-2">
              {APPS.map((app) => (
                <button key={app.label} type="button" className="btn btn-secondary min-h-9 px-3 py-1.5 text-sm" onClick={() => void openWith(q, app.url, `${app.label}:${q}`)}>
                  {copied === `${app.label}:${q}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {app.label}
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
