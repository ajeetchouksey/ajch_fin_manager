import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { AI_PROMPTS, PROMPT_GROUPS, promptText, type AiPrompt } from '../lib/ledger/prompts'

const AI_APPS = [
  { name: 'Claude', url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: 'ChatGPT', url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
]

function PromptCard({ prompt, connected }: { prompt: AiPrompt; connected: boolean }) {
  const [copied, setCopied] = useState(false)
  const text = promptText(prompt, connected)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <li className="card flex flex-col gap-3 p-5">
      <div>
        <h3 className="card-title">{prompt.title}</h3>
        <p className="text-slate-400">{prompt.when}</p>
      </div>
      <details className="text-sm text-slate-300">
        <summary className="cursor-pointer font-semibold text-accent">Read the prompt</summary>
        <p className="mt-2 whitespace-pre-line rounded-lg bg-tint p-3">{text}</p>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        {AI_APPS.map((app) => (
          <a key={app.name} className="btn btn-secondary" href={app.url(text)} target="_blank" rel="noreferrer noopener">
            Open in {app.name}
            <ExternalLink size={14} aria-hidden />
          </a>
        ))}
      </div>
    </li>
  )
}

/** Ask your AI: ready-made prompts for goals and investing. They hold none of your numbers and leave the decision to you. */
export function AskAiPage() {
  const [connected, setConnected] = useState(true)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        eyebrow="Your AI app, your decision"
        title="Ask your AI"
        description="Prompts to copy into the AI app you already use. They contain none of your numbers, they ask for ranges instead of promises, and the choice stays yours."
      />

      <section aria-labelledby="how-heading" className="card-tint flex flex-col gap-3 p-6">
        <h2 id="how-heading" className="card-title">Does your AI app read FinBuddy?</h2>
        <p className="text-slate-300">
          With the FinBuddy connector, your AI app reads your accounts and goals itself. Without it, the prompt tells the AI to ask you for the figures.
          See <Link to="/settings" className="font-semibold text-accent">Settings</Link> to connect it.
        </p>
        <div role="radiogroup" aria-label="Does your AI app read FinBuddy?" className="flex flex-wrap gap-2">
          <button type="button" role="radio" aria-checked={connected} className={`btn ${connected ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setConnected(true)}>
            Yes, it is connected
          </button>
          <button type="button" role="radio" aria-checked={!connected} className={`btn ${!connected ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setConnected(false)}>
            No, it will ask me
          </button>
        </div>
      </section>

      {PROMPT_GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={`grp-${g.id}`} className="flex flex-col gap-3">
          <h2 id={`grp-${g.id}`} className="eyebrow">{g.label}</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {AI_PROMPTS.filter((p) => p.group === g.id).map((p) => (
              <PromptCard key={p.id} prompt={p} connected={connected} />
            ))}
          </ul>
        </section>
      ))}

      <p className="text-sm text-slate-400">
        General information, not regulated financial advice. Check anything important with a qualified adviser.
      </p>
    </div>
  )
}
