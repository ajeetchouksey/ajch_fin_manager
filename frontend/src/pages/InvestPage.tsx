import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { ErrorNote, Field, inputClass, selectClass } from '../components/ledger/ui'
import { ExpertSwitch } from '../components/invest/ExpertSwitch'
import { useLedger } from '../context/LedgerContext'
import { useExpertMode } from '../hooks/useExpertMode'
import { useProfile } from '../hooks/useProfile'
import { accountBalances } from '../lib/ledger/balances'
import { aboutYou, ageIn, cleanInvestorProfile, EMPLOYMENT, INCOME_STABILITY, isEmptyInvestor } from '../lib/ledger/investor'
import { RiskSection } from '../components/invest/RiskSection'
import { PlansSection } from '../components/invest/PlansSection'
import { formatMoney, todayIso } from '../lib/ledger/types'

/** Invest: what you hold, what you tell us about yourself (all optional), and the expert-mode switch. */
export function InvestPage() {
  const { status, accounts, balances, transactions, goals, profile } = useLedger()
  const { save, saving, error, setError } = useProfile()
  const [expert] = useExpertMode()
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

  const today = todayIso()
  const held = useMemo(() => {
    const out: Array<{ id: string; name: string; group: string; balance: number; currency: string; asOf: string }> = []
    for (const currency of new Set(accounts.map((a) => a.currency))) {
      for (const r of accountBalances(accounts, currency, balances, transactions, today).rows) {
        if (r.group === 'investments' || r.group === 'retirement') out.push({ id: r.id, name: r.name, group: r.groupLabel, balance: r.balance, currency, asOf: r.asOf })
      }
    }
    return out
  }, [accounts, balances, transactions, today])

  if (status !== 'ready') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Optional · your answers stay in your Google Drive" title="Invest" />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </div>
    )
  }

  const draft = cleanInvestorProfile({ birthYear, employment, incomeStability: stability })
  const yearBad = birthYear.trim() !== '' && draft.birthYear === undefined
  const age = ageIn(draft)
  const changed = JSON.stringify(aboutYou(draft)) !== JSON.stringify(aboutYou(stored))

  const submit = async (next: typeof draft) => {
    setSaved(false)
    setError(null)
    const done = await save({ investorProfile: { ...next, riskAnswers: stored.riskAnswers } })
    if (done) setSaved(true)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        eyebrow="Optional · your answers stay in your Google Drive"
        title="Invest"
        description="What you hold, and what you choose to tell us about yourself so planning can fit your situation."
      />

      <section aria-labelledby="expert-heading" className="card-tint flex items-center gap-4 p-6">
        <span className="flex-1">
          <h2 id="expert-heading" className="card-title">Expert mode</h2>
          <span className="block text-slate-300">
            Adds the deeper investing tools as they arrive: holdings, cost basis and real return. It is off until you turn it on, and it never turns on by itself.
          </span>
          {expert && <span className="mt-1 block text-sm text-slate-400">Expert mode is on. Nothing extra is available yet; the first tools arrive with holdings.</span>}
        </span>
        <ExpertSwitch />
      </section>

      <section aria-labelledby="held-heading" className="card flex flex-col gap-3 p-6">
        <h2 id="held-heading" className="card-title">Your investments so far</h2>
        {held.length === 0 ? (
          <p className="text-slate-400">
            No investment or retirement accounts yet. <Link to="/accounts" className="font-semibold text-accent">Add one in Accounts</Link> and it shows up here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {held.map((h) => {
              const linked = goals.filter((g) => g.accountId === h.id).map((g) => g.name)
              return (
                <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{h.name}</span>
                    <span className="block text-sm text-slate-400">
                      {h.group} · as of {h.asOf.slice(0, 10)}
                      {linked.length ? ` · for ${linked.join(', ')}` : ''}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-ink">{formatMoney(h.balance, h.currency)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <PlansSection />

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
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!isEmptyInvestor(stored) && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void submit({})}>Clear my answers</button>
          )}
        </div>
      </section>

      <section aria-labelledby="ask-heading" className="card flex flex-col gap-2 p-6">
        <h2 id="ask-heading" className="card-title">Think it through with your AI</h2>
        <p className="text-slate-400">
          Ready-made prompts for your own AI app to plan a goal, test it against bad years and prepare for an adviser. You decide.{' '}
          <Link to="/ask-ai" className="font-semibold text-accent">Open the prompts</Link>
        </p>
      </section>

      <RiskSection />
    </div>
  )
}
