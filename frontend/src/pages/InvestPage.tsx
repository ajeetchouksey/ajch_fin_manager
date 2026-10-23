import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, MessageSquareText } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { ErrorNote, Field, inputClass, selectClass } from '../components/ledger/ui'
import { ExpertSwitch } from '../components/invest/ExpertSwitch'
import { useLedger } from '../context/LedgerContext'
import { useExpertMode } from '../hooks/useExpertMode'
import { useProfile } from '../hooks/useProfile'
import { aboutYou, ageIn, cleanInvestorProfile, EMPLOYMENT, INCOME_STABILITY, isEmptyInvestor } from '../lib/ledger/investor'
import { RiskSection } from '../components/invest/RiskSection'
import { PlansSection } from '../components/invest/PlansSection'
import { ScenariosSection } from '../components/invest/ScenariosSection'
import { AllocationSection } from '../components/invest/AllocationSection'
import { HoldingsSection } from '../components/invest/HoldingsSection'
import { InvestDashboard } from '../components/invest/viz/InvestDashboard'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'goals', label: 'Goals' },
  { id: 'holdings', label: 'Mix and holdings' },
  { id: 'plans', label: 'Plans' },
  { id: 'risk', label: 'Risk' },
  { id: 'you', label: 'About you' },
] as const
type TabId = (typeof TABS)[number]['id']

/** The "About you" answers (all optional) that planning and the risk picture use. */
function AboutYou() {
  const { profile } = useLedger()
  const { save, saving, error, setError } = useProfile()
  const stored = useMemo(() => cleanInvestorProfile(profile?.investorProfile), [profile])
  const [birthYear, setBirthYear] = useState(stored.birthYear ? String(stored.birthYear) : '')
  const [employment, setEmployment] = useState<string>(stored.employment ?? '')
  const [stability, setStability] = useState<string>(stored.incomeStability ?? '')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setBirthYear(stored.birthYear ? String(stored.birthYear) : '')
    setEmployment(stored.employment ?? '')
    setStability(stored.incomeStability ?? '')
  }, [stored])

  const draft = cleanInvestorProfile({ birthYear, employment, incomeStability: stability })
  const yearBad = birthYear.trim() !== '' && draft.birthYear === undefined
  const age = ageIn(draft)
  const changed = JSON.stringify(aboutYou(draft)) !== JSON.stringify(aboutYou(stored))

  const submit = async (next: typeof draft) => {
    setSaved(false)
    setError(null)
    const done = await save({ investorProfile: { ...next, riskAnswers: stored.riskAnswers, allocationTarget: stored.allocationTarget } })
    if (done) setSaved(true)
  }

  return (
    <section aria-labelledby="you-heading" className="card flex flex-col gap-4 p-6">
      <div>
        <h2 id="you-heading" className="card-title">About you</h2>
        <p className="text-slate-400">
          All optional. These help judge how much risk you can carry; skip anything you prefer not to share. They are kept only in your own Ledger, and your AI app sees them only if you let it read them.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Year of birth" htmlFor="inv-year" hint={age !== undefined ? `About ${age} years old` : 'For example 1988'}>
          <input id="inv-year" className={inputClass} inputMode="numeric" maxLength={4} value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ''))} aria-invalid={yearBad} />
          {yearBad && <span className="text-sm text-warn-text">Enter a year between 1900 and {new Date().getFullYear() - 16}, or leave it empty.</span>}
        </Field>
        <Field label="Work" htmlFor="inv-work">
          <select id="inv-work" className={selectClass} value={employment} onChange={(e) => setEmployment(e.target.value)}>
            <option value="">Prefer not to say</option>
            {EMPLOYMENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Income" htmlFor="inv-income">
          <select id="inv-income" className={selectClass} value={stability} onChange={(e) => setStability(e.target.value)}>
            <option value="">Prefer not to say</option>
            {INCOME_STABILITY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {saved && !changed && <p className="text-good" role="status">Saved in your Ledger.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={saving || yearBad || !changed} onClick={() => void submit(draft)}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!isEmptyInvestor(stored) && (
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void submit({})}>Clear my answers</button>
        )}
      </div>
    </section>
  )
}

/** Invest: a visual overview first, then one tab per job. */
export function InvestPage() {
  const { status } = useLedger()
  const [expert] = useExpertMode()
  const [params] = useSearchParams()
  const asked = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === asked) ? (asked as TabId) : 'overview'

  if (status !== 'ready') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Optional - your answers stay in your Google Drive" title="Invest" />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </div>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader eyebrow="Optional - your answers stay in your Google Drive" title="Invest" description="Where your money is, where your goals could land, and what to think about next." />

      <nav aria-label="Invest sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={t.id === 'overview' ? '/invest' : `/invest?tab=${t.id}`}
            aria-current={t.id === tab ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${t.id === tab ? 'bg-tint text-ink' : 'text-slate-300 hover:bg-subtle'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <InvestDashboard />
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/invest/review" className="card flex items-start gap-3 p-5 hover:border-line-strong">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="card-title block">Adviser pack</span>
                <span className="text-sm text-slate-400">One printable page with your goals, plans, holdings and questions to ask.</span>
              </span>
            </Link>
            <Link to="/ask-ai" className="card flex items-start gap-3 p-5 hover:border-line-strong">
              <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="card-title block">Think it through with your AI</span>
                <span className="text-sm text-slate-400">Ready-made prompts for your own AI app. You decide.</span>
              </span>
            </Link>
          </div>
        </>
      )}

      {tab === 'goals' && <ScenariosSection />}

      {tab === 'holdings' && (
        <>
          <section aria-labelledby="expert-heading" className="card-tint flex items-center gap-4 p-6">
            <span className="flex-1">
              <h2 id="expert-heading" className="card-title">Expert mode</h2>
              <span className="block text-slate-300">Adds holdings, trades, cost basis and real return. Off until you turn it on; it never turns on by itself.</span>
            </span>
            <ExpertSwitch />
          </section>
          <AllocationSection />
          {expert && <HoldingsSection />}
        </>
      )}

      {tab === 'plans' && <PlansSection />}
      {tab === 'risk' && <RiskSection />}
      {tab === 'you' && <AboutYou />}
    </div>
  )
}
