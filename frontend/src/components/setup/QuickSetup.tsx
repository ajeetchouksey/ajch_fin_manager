import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, PenLine, ShieldCheck, Table2, Upload, X } from 'lucide-react'
import { LogoMark } from '../Logo'
import { ErrorNote } from '../FirstLoginOnboarding'
import { ADD_TRANSACTION_PATH, IMPORT_PATH } from '../navigation'
import { useProfile } from '../../hooks/useProfile'
import { usePeriodMode } from '../../hooks/usePeriodMode'
import { readLastEntry, writeLastEntry } from '../../hooks/useLedgerOptions'
import { categoryColor } from '../../lib/ledger/categoryColors'
import { CURRENCIES, currencyForCountry } from '../../lib/ledger/types'
import type { UserSchemaDefinition } from '../../types'
import { COUNTRIES, DEFAULT_CATEGORIES } from './options'
import { CustomEntries } from './fields'

interface QuickSetupProps {
  onComplete: () => void
  onSkip?: () => void
  /** Open the detailed setup after finishing */
  onAddDetail?: () => void
}

const STEP_LABELS = ['About you', 'Bring your money in', 'Categories', 'Done']

type Source = 'import' | 'sheet' | 'manual'
const SOURCES: Array<{ id: Source; title: string; note: string; icon: typeof Upload; color: string }> = [
  { id: 'import', title: 'Import a bank statement', note: 'CSV or PDF from your bank — every row is read and sorted for you.', icon: Upload, color: '#2F7FD1' },
  { id: 'sheet', title: 'Use your FinBuddy ledger', note: 'Your Ledger is a Google Sheet in your Drive. Carry on with what is already there.', icon: Table2, color: '#1F9D8B' },
  { id: 'manual', title: 'Start by hand', note: 'Add balances and a few transactions yourself.', icon: PenLine, color: '#E5A400' },
]

const NEXT_UP = [
  { title: 'Your overview', text: "shows money in, money out and what's left, month by month.", color: 'var(--color-accent)' },
  { title: '“Worth checking”', text: 'flags payments that look miscategorised or duplicated.', color: '#E5A400' },
  { title: 'Budgets and goals', text: "start from what you actually spend — set them when you're ready.", color: '#1F9D8B' },
]

const label = 'flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300'

/** Guided first-time setup in four steps — no AI. Saves the profile to the Ledger. */
export function QuickSetup({ onComplete, onSkip, onAddDetail }: QuickSetupProps) {
  const { load, save, saving, error } = useProfile()
  const navigate = useNavigate()
  const [mode, setMode] = usePeriodMode()
  const [step, setStep] = useState(1) // 1 about you · 2 source · 3 categories · 4 done
  const [existing, setExisting] = useState<UserSchemaDefinition | null>(null)
  const [bankName, setBankName] = useState('')
  const [country, setCountry] = useState('DE')
  const [currency, setCurrency] = useState(() => readLastEntry().currency || 'EUR')
  const [currencyTouched, setCurrencyTouched] = useState(() => !!readLastEntry().currency)
  const [source, setSource] = useState<Source>('import')
  const [off, setOff] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Pre-fill when the user already has a profile (re-running the setup)
  useEffect(() => {
    let cancelled = false
    load().then((p) => {
      if (cancelled || !p) return
      setExisting(p)
      const c = p.taxSettings?.country || p.residenceCountries?.[0]
      if (c) setCountry(c)
      if (p.ownNames?.length) setBankName(p.ownNames[0])
      if (p.expenseCategories?.length) {
        setOff(new Set(DEFAULT_CATEGORIES.filter((d) => !p.expenseCategories.includes(d))))
        setCustom(p.expenseCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c)))
      }
    })
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // Full-screen: the page behind must not scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const skip = onSkip ?? onComplete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (step === 4 ? onComplete : skip)()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onComplete, skip])

  const pickCountry = (c: string) => {
    setCountry(c)
    if (!currencyTouched) setCurrency(currencyForCountry(c))
  }

  const categories = [...DEFAULT_CATEGORIES.filter((c) => !off.has(c)), ...custom]

  const finish = async () => {
    const countries = existing?.residenceCountries?.includes(country) ? existing.residenceCountries : [country, ...(existing?.residenceCountries ?? [])]
    const name = bankName.trim()
    const otherNames = (existing?.ownNames ?? []).slice(1)
    const saved = await save(
      {
        residenceCountries: countries,
        accountTypes: existing?.accountTypes?.length ? existing.accountTypes : ['bank'],
        expenseCategories: categories,
        taxSettings: { ...(existing?.taxSettings ?? {}), country },
        ownNames: name ? [name, ...otherNames.filter((n) => n !== name)] : otherNames,
      },
      { complete: true },
    )
    if (!saved) return
    writeLastEntry({ ...readLastEntry(), currency })
    setStep(4)
  }

  const next = () => (step === 3 ? void finish() : setStep((s) => s + 1))
  const go = (path: string) => {
    onComplete()
    navigate(path)
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="qs-title" className="fixed inset-0 z-50 grid overflow-y-auto bg-canvas text-ink md:grid-cols-[minmax(320px,520px)_minmax(0,1fr)]">
      <aside aria-label="About aaryaai" className="relative hidden flex-col justify-between overflow-hidden bg-panel p-12 text-white md:flex">
        <svg aria-hidden width="420" height="420" viewBox="0 0 64 64" className="pointer-events-none absolute -right-[120px] -bottom-[100px] opacity-20">
          <path d="M32 2 L58 17 V47 L32 62 L6 47 V17 Z" fill="none" stroke="#A99BFF" strokeWidth="1.2" />
          <path d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" fill="none" stroke="#A99BFF" strokeWidth="1" />
        </svg>
        <div className="flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <span className="font-display text-[28px] font-semibold" style={{ color: '#fff' }}>aarya<span style={{ color: '#A99BFF' }}>ai</span></span>
        </div>
        <div className="relative flex flex-col gap-4">
          <p className="font-display text-[52px] leading-none font-bold" style={{ color: '#fff' }}>Know where your money goes.</p>
          <p className="max-w-[380px] text-base leading-relaxed" style={{ color: '#C9C3EC' }}>
            Import your bank statements, let aaryaai sort them, and see every month at a glance. Your ledger lives in your own Google Drive.
          </p>
        </div>
        <ol aria-label="Setup progress" className="relative flex flex-col gap-2.5">
          {STEP_LABELS.map((l, i) => {
            const n = i + 1
            const done = n < step
            const on = n === step
            return (
              <li key={l} className="flex items-center gap-3 font-semibold" style={{ color: on || done ? '#fff' : '#8F89B5' }} aria-current={on ? 'step' : undefined}>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold"
                  style={{ borderColor: on || done ? '#A99BFF' : '#4A4570', background: done ? '#5B4BD6' : 'transparent', color: '#fff' }}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
                </span>
                {l}
              </li>
            )
          })}
        </ol>
      </aside>

      <main className="relative flex min-h-full w-full max-w-[760px] flex-col justify-center gap-6 px-5 py-10 sm:px-10 md:px-[72px] md:py-14">
        <button type="button" onClick={step === 4 ? onComplete : skip} className="icon-btn absolute top-4 right-4" aria-label={step === 4 ? 'Close' : 'Skip setup for now'}>
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 md:hidden">
          <LogoMark className="h-8 w-8" />
          <span className="font-display text-2xl font-semibold">aarya<span className="text-accent">ai</span></span>
        </div>

        {step === 4 && (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-good text-white">
            <Check className="h-8 w-8" strokeWidth={2.6} />
          </span>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow text-accent">Step {step} of 4</span>
          <h2 id="qs-title" ref={headingRef} tabIndex={-1} className="font-display text-[40px] leading-tight font-bold outline-none">
            {['Let’s set you up', 'Bring your money in', 'Choose your categories', 'You’re all set'][step - 1]}
          </h2>
          <span className="text-slate-400">
            {[
              'Takes about two minutes. You can change all of this later in Settings.',
              'Pick one to start. You can add more accounts any time.',
              'Each category keeps its colour everywhere. Turn off the ones you don’t need.',
              'Here’s what happens next.',
            ][step - 1]}
          </span>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <label className={label}>
              Your name as your bank shows it
              <input className="field" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. ASHA K VERMA" maxLength={80} autoComplete="name" />
              <span className="text-xs font-normal text-slate-400">Payments to or from this name count as moves between your own accounts.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                Where you live and pay tax
                <select className="field" value={country} onChange={(e) => pickCountry(e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className={label}>
                Main currency
                <select
                  className="field"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value)
                    setCurrencyTouched(true)
                  }}
                >
                  {Array.from(new Set([currency, ...CURRENCIES])).map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-slate-300">How do you think about a month?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['calendar', 'Calendar month', '1st to last day'],
                  ['salary', 'Salary to salary', 'From payday to the day before the next'],
                ] as const).map(([value, title, note]) => (
                  <label key={value} className={`flex cursor-pointer gap-3 rounded-[14px] p-4 ${mode === value ? 'border-2 border-accent bg-tint' : 'border border-line-strong bg-surface'}`}>
                    <input type="radio" name="qs-period" className="mt-0.5 h-[18px] w-[18px] accent-[var(--color-accent)]" checked={mode === value} onChange={() => setMode(value)} />
                    <span className="flex flex-col gap-0.5">
                      <b className="text-ink">{title}</b>
                      <span className="text-sm text-slate-400">{note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {SOURCES.map(({ id, title, note, icon: Icon, color }) => (
              <button
                key={id}
                type="button"
                aria-pressed={source === id}
                onClick={() => setSource(id)}
                className={`flex items-center gap-4 rounded-2xl border-2 p-[18px] text-left ${source === id ? 'border-accent bg-tint' : 'border-line bg-surface hover:border-line-strong'}`}
              >
                <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[14px]">
                  <span aria-hidden className="absolute inset-0 opacity-20" style={{ background: color }} />
                  <Icon className="relative h-6 w-6 text-ink" />
                </span>
                <span className="flex flex-col gap-1">
                  <b className="text-base text-ink">{title}</b>
                  <span className="text-sm text-slate-400">{note}</span>
                </span>
              </button>
            ))}
            <p className="mt-1 flex items-center gap-2.5 text-sm text-slate-300">
              <ShieldCheck className="h-[18px] w-[18px] text-good" aria-hidden /> Your data is stored in your Google Drive, not on our servers.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {DEFAULT_CATEGORIES.map((c) => {
                const on = !off.has(c)
                return (
                  <button
                    key={c}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() =>
                      setOff((s) => {
                        const n = new Set(s)
                        if (on) n.add(c)
                        else n.delete(c)
                        return n
                      })
                    }
                    className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-3.5 text-left ${on ? 'bg-surface' : 'border-line bg-row opacity-50'}`}
                    style={on ? { borderColor: categoryColor(c) } : undefined}
                  >
                    <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: categoryColor(c) }} />
                    <span className="flex-1 font-semibold text-ink">{c}</span>
                    <span className="text-xs text-slate-400">{on ? 'On' : 'Hidden'}</span>
                  </button>
                )
              })}
              {custom.map((c) => (
                <div key={c} className="flex min-h-[52px] items-center gap-3 rounded-xl border bg-surface px-3.5" style={{ borderColor: categoryColor(c) }}>
                  <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: categoryColor(c) }} />
                  <span className="flex-1 font-semibold text-ink">{c}</span>
                  <button type="button" className="text-xs text-slate-400 hover:text-ink" onClick={() => setCustom((l) => l.filter((x) => x !== c))} aria-label={`Remove ${c}`}>Remove</button>
                </div>
              ))}
            </div>
            {adding ? (
              <CustomEntries values={custom} onChange={setCustom} placeholder="e.g. Pets" addLabel="Add" />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="min-h-11 self-start rounded-[10px] border border-dashed border-line-strong bg-surface px-3.5 font-semibold text-slate-300 hover:text-ink">
                + Add your own category
              </button>
            )}
            {categories.length === 0 && <p className="text-sm text-warn-text">Keep at least one category on.</p>}
            {error && <ErrorNote message={error} />}
          </div>
        )}

        {step === 4 && (
          <ul className="flex flex-col gap-3">
            {NEXT_UP.map((n) => (
              <li key={n.title} className="flex items-start gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5">
                <span aria-hidden className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: n.color }} />
                <span className="text-slate-300"><b className="text-ink">{n.title}</b> {n.text}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {step > 1 && step < 4 ? (
            <button type="button" className="btn btn-secondary min-h-12" onClick={() => setStep((s) => s - 1)}>Back</button>
          ) : step === 4 && onAddDetail ? (
            <button type="button" className="btn btn-secondary min-h-12" onClick={onAddDetail}>Add more detail</button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <button type="button" className="btn btn-primary min-h-12 px-6" onClick={next} disabled={saving || (step === 3 && categories.length === 0)}>
              {step === 3 ? (saving ? 'Saving…' : 'Finish setup') : 'Continue'}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {source === 'import' && <button type="button" className="btn btn-secondary min-h-12" onClick={() => go(IMPORT_PATH)}>Import a statement</button>}
              {source === 'manual' && <button type="button" className="btn btn-secondary min-h-12" onClick={() => go(ADD_TRANSACTION_PATH)}>Add a transaction</button>}
              <button type="button" className="btn btn-primary min-h-12 px-6" onClick={() => go('/')}>Go to my overview</button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
