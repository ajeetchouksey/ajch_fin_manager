import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, ExternalLink, HardDrive, Plus, SlidersHorizontal, Trash2, Users, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ThemeSwitch } from '../components/UserMenu'
import { useSetup } from '../context/SetupContext'
import { useLedger } from '../context/LedgerContext'
import { useAuth } from '../hooks/useAuth'
import { usePeriodMode } from '../hooks/usePeriodMode'
import { useProfile } from '../hooks/useProfile'
import { useLedgerOptions } from '../hooks/useLedgerOptions'
import { learnFromLedger, payeeKey } from '../lib/ledger/categorize'
import { categoryColor } from '../lib/ledger/categoryColors'
import { currenciesByUse } from '../lib/ledger/summary'

const AI_APPS = [
  { name: 'Claude', note: 'Add FinBuddy as a connector', url: 'https://claude.ai/new' },
  { name: 'ChatGPT', note: 'Add FinBuddy as a connector', url: 'https://chatgpt.com/' },
  { name: 'Gemini', note: 'Ask with FinBuddy open beside it', url: 'https://gemini.google.com/app' },
]

const csvCell = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

/** Settings (design): profile and currency, categorisation rules, AI assistant, your profile, data and appearance. */
export function SettingsPage() {
  const { openDetailedSetup } = useSetup()
  const { user } = useAuth()
  const { transactions, trash } = useLedger()
  const [mode, setMode] = usePeriodMode()
  const { save, saving, error: saveError } = useProfile()
  const opts = useLedgerOptions()
  const myRules = opts.userRules
  const categories = useMemo(() => Array.from(new Set([...opts.expenseCategories, ...opts.incomeCategories])), [opts.expenseCategories, opts.incomeCategories])
  const [ruleMatch, setRuleMatch] = useState('')
  const [ruleCat, setRuleCat] = useState('')
  const addRule = async () => {
    const match = ruleMatch.trim()
    const category = ruleCat || categories[0]
    if (!match || !category) return
    const next = [...myRules.filter((r) => r.match.toLowerCase() !== match.toLowerCase()), { match, category }]
    if (await save({ categoryRules: next })) setRuleMatch('')
  }
  const removeRule = (match: string) => void save({ categoryRules: myRules.filter((r) => r.match !== match) })
  const currencies = useMemo(() => currenciesByUse(transactions), [transactions])

  // Rules: what the app has learned from the categories you chose (payee → category), most used first
  const rules = useMemo(() => {
    const learned = learnFromLedger(transactions)
    const hits = new Map<string, number>()
    for (const t of transactions) {
      const k = `${t.direction}|${payeeKey(t.description)}`
      hits.set(k, (hits.get(k) ?? 0) + 1)
    }
    return [...learned.entries()]
      .map(([k, v]) => ({ match: k.split('|')[1], category: v.category, hits: hits.get(k) ?? 0 }))
      .filter((r) => r.match && r.hits > 1)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 8)
  }, [transactions])

  const exportAll = () => {
    const head = ['date', 'direction', 'amount', 'currency', 'category', 'description', 'account', 'notes', 'tags']
    const rows = [...transactions].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.direction, t.amount, t.currency, t.category, t.description, t.account, t.notes, t.tags.join(', ')])
    const url = URL.createObjectURL(new Blob([[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'finance-all-transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const row = 'flex min-h-14 w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-tintline hover:bg-tint'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Your data stays in your Google Drive" title="Settings" />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="pf-heading" className="card flex flex-col gap-4 p-6">
          <h2 id="pf-heading" className="card-title">Profile & currencies</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
              Display name
              <input className="field" value={user?.name ?? ''} readOnly title="From your Google account" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
              Main currency
              <input className="field" value={currencies[0] ?? 'EUR'} readOnly title="The currency most of your transactions use" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300 sm:col-span-2">
              Month starts on
              <select className="field" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="calendar">1st of the month</option>
                <option value="salary">Salary day (a cycle runs from one salary to the next)</option>
              </select>
            </label>
          </div>
          {currencies.length > 1 && <p className="text-sm text-slate-400">You also have transactions in {currencies.slice(1).join(', ')}. Totals are shown per currency and never converted.</p>}
        </section>

        <section aria-labelledby="da-heading" className="card flex flex-col gap-3 p-6">
          <h2 id="da-heading" className="card-title">Data & appearance</h2>
          <div className="-mx-3">
            <ThemeSwitch />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={exportAll} disabled={!transactions.length}><Download className="h-4 w-4" aria-hidden /> Export all data</button>
            <Link to="/trash" className="btn btn-secondary"><Trash2 className="h-4 w-4" aria-hidden /> Trash{trash.length ? ` (${trash.length})` : ''}</Link>
          </div>
          <p className="text-sm text-slate-400">Your Ledger is a Google Sheet in your own Drive; exporting gives you a CSV copy of every transaction.</p>
        </section>

        <section aria-labelledby="rl-heading" className="card flex flex-col gap-1 p-6">
          <div className="mb-2 flex flex-col gap-1">
            <h2 id="rl-heading" className="card-title">Categorisation rules</h2>
            <span className="text-sm text-slate-400">Your own rules come first, then what the app learned from the categories you choose.</span>
          </div>
          <form
            className="mb-2 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void addRule()
            }}
          >
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-[13px] font-semibold text-slate-300">
              If text contains
              <input className="field" value={ruleMatch} onChange={(e) => setRuleMatch(e.target.value)} placeholder="e.g. Lidl" />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-[13px] font-semibold text-slate-300">
              Category
              <select className="field" value={ruleCat || categories[0] || ''} onChange={(e) => setRuleCat(e.target.value)}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving || !ruleMatch.trim()}><Plus className="h-4 w-4" aria-hidden /> Add rule</button>
          </form>
          {saveError && <p role="alert" className="text-sm text-bad">{saveError}</p>}
          {myRules.map((r) => (
            <div key={`mine-${r.match}`} className="flex flex-wrap items-center gap-2 border-t border-row py-2.5 text-sm">
              <span className="text-slate-400">If text contains</span>
              <code className="rounded-md bg-subtle px-2 py-0.5 font-mono text-[13px] text-ink">{r.match}</code>
              <span className="text-slate-500" aria-hidden>→</span>
              <span className="flex items-center gap-1.5 font-medium text-ink"><span className="h-2 w-2 rounded-full" style={{ background: categoryColor(r.category) }} />{r.category}</span>
              <span className="ml-auto text-xs text-slate-500">Your rule</span>
              <button type="button" className="icon-btn" aria-label={`Delete rule ${r.match}`} onClick={() => removeRule(r.match)} disabled={saving}><X className="h-4 w-4" aria-hidden /></button>
            </div>
          ))}
          {rules.length === 0 && myRules.length === 0 && <p className="text-slate-400">No rules yet. Add one above, or they appear once you categorise the same payee a few times.</p>}
          {rules.map((r) => (
            <div key={`${r.match}-${r.category}`} className="flex flex-wrap items-center gap-2 border-t border-row py-2.5 text-sm">
              <span className="text-slate-400">If text contains</span>
              <code className="rounded-md bg-subtle px-2 py-0.5 font-mono text-[13px] text-ink">{r.match}</code>
              <span className="text-slate-500" aria-hidden>→</span>
              <span className="flex items-center gap-1.5 font-medium text-ink"><span className="h-2 w-2 rounded-full" style={{ background: categoryColor(r.category) }} />{r.category}</span>
              <span className="ml-auto text-xs text-slate-500">{r.hits} payments</span>
            </div>
          ))}
        </section>

        <section aria-labelledby="ai-heading" className="card flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 id="ai-heading" className="card-title">AI assistant</h2>
            <span className="text-sm text-slate-400">Use FinBuddy from the AI app you already have. It reads your Ledger through the FinBuddy connector; nothing goes through AaryaAI and no API key is needed.</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {AI_APPS.map((a) => (
              <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-3.5 hover:border-tintline hover:bg-tint">
                <span className="flex items-center justify-between font-semibold text-ink">{a.name}<ExternalLink className="h-3.5 w-3.5 text-slate-500" aria-hidden /></span>
                <span className="text-xs text-slate-400">{a.note}</span>
              </a>
            ))}
          </div>
        </section>

        <section aria-labelledby="profile-heading" className="card flex flex-col gap-2 p-6 lg:col-span-2">
          <h2 id="profile-heading" className="card-title mb-1">Your profile</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <button type="button" className={row} onClick={() => openDetailedSetup()}>
              <SlidersHorizontal className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium text-ink">Financial setup</span>
                <span className="block text-sm text-slate-400">Countries, categories, goals, investments, tax</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
            </button>
            <button type="button" className={row} onClick={() => openDetailedSetup('household')}>
              <Users className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium text-ink">Household and your bank name</span>
                <span className="block text-sm text-slate-400">Payments to or from your own name count as transfers</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
            </button>
            <Link to="/settings/storage" className={row}>
              <HardDrive className="h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium text-ink">Storage</span>
                <span className="block text-sm text-slate-400">Your Ledger in Google Drive</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
