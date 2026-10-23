import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote } from '../ledger/ui'
import { useLedger } from '../../context/LedgerContext'
import { useProfile } from '../../hooks/useProfile'
import { cleanInvestorProfile, type RiskAnswers } from '../../lib/ledger/investor'
import { ability, abilityFactors, ledgerRiskInputs, LEVEL_LABEL, overallNeed, RISK_QUESTIONS, togetherNote, willingness, type Level } from '../../lib/ledger/risk'
import { todayIso } from '../../lib/ledger/types'

function LevelChip({ level }: { level: Level | null }) {
  return level ? (
    <span className="rounded-full bg-tint px-2.5 py-0.5 text-sm font-semibold text-ink">{LEVEL_LABEL[level]}</span>
  ) : (
    <span className="rounded-full bg-subtle px-2.5 py-0.5 text-sm font-semibold text-slate-300">Not enough yet</span>
  )
}

/** Risk as three answers side by side (ability, willingness, need), the questions behind willingness, and how they fit together. */
export function RiskSection() {
  const { accounts, balances, transactions, goals, profile } = useLedger()
  const { save, saving, error, setError } = useProfile()
  const stored = useMemo(() => cleanInvestorProfile(profile?.investorProfile), [profile])
  const [answers, setAnswers] = useState<RiskAnswers>(stored.riskAnswers ?? {})
  const [saved, setSaved] = useState(false)
  useEffect(() => setAnswers(stored.riskAnswers ?? {}), [stored])

  const today = todayIso()
  const calc = useMemo(
    () => ledgerRiskInputs({ transactions, accounts, balances, goals, householdMembers: profile?.householdMembers, investor: stored, today }),
    [transactions, accounts, balances, goals, profile, stored, today],
  )
  const ab = ability(abilityFactors(calc.ability))
  const wi = willingness(stored.riskAnswers)
  const need = overallNeed(calc.needs)
  const stretch = calc.needs.some((n) => n.stretch)
  const note = togetherNote(ab.level, wi.level, need, stretch)
  const changed = JSON.stringify(answers) !== JSON.stringify(stored.riskAnswers ?? {})

  const submit = async () => {
    setSaved(false)
    setError(null)
    const done = await save({ investorProfile: { ...stored, riskAnswers: answers } })
    if (done) setSaved(true)
  }

  return (
    <>
      <section aria-labelledby="risk-heading" className="card flex flex-col gap-4 p-6">
        <div>
          <h2 id="risk-heading" className="card-title">Your risk, three ways</h2>
          <p className="text-slate-400">Shown side by side, because the useful part is where they differ. This is general information, not a recommendation.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <span className="flex items-center justify-between gap-2"><b className="text-ink">Ability</b><LevelChip level={ab.level} /></span>
            <span className="text-sm text-slate-400">Could you afford a large fall?</span>
            {ab.factors.length === 0 && <span className="text-sm text-slate-300">Add your year of birth or income above, accounts, goals or household details to see this.</span>}
            {ab.factors.map((f) => (
              <span key={f.id} className="text-sm text-slate-300"><b className="font-medium text-ink">{f.label}:</b> {f.reason}</span>
            ))}
            {ab.factors.length === 1 && <span className="text-sm text-slate-400">One more detail is needed.</span>}
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <span className="flex items-center justify-between gap-2"><b className="text-ink">Willingness</b><LevelChip level={wi.level} /></span>
            <span className="text-sm text-slate-400">Would you stay calm in a fall?</span>
            <span className="text-sm text-slate-300">
              {wi.level ? `From ${wi.answered} of ${wi.total} answers below.` : `${wi.answered} of ${wi.total} questions answered; answer at least 4 below.`}
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <span className="flex items-center justify-between gap-2"><b className="text-ink">Need</b><LevelChip level={need} /></span>
            <span className="text-sm text-slate-400">What return do your goals require?</span>
            {calc.needs.length === 0 && (
              <span className="text-sm text-slate-300">
                Needs a goal with a target and a date, paid for from an investment account. <Link to="/goals" className="font-semibold text-accent">Set goals</Link>
              </span>
            )}
            {calc.needs.map((n) => (
              <span key={n.id} className="text-sm text-slate-300">
                <b className="font-medium text-ink">{n.name}:</b>{' '}
                {n.rate === null ? 'not reachable at any return' : n.rate === 0 ? 'saving alone gets there' : `about ${(n.rate * 100).toFixed(1)}% a year`}
                {n.stretch ? ' (more than any plan should count on)' : ''}
              </span>
            ))}
          </div>
        </div>
        {note && <p className="rounded-xl bg-subtle px-3.5 py-3 text-ink">{note}</p>}
      </section>

      <section aria-labelledby="will-heading" className="card flex flex-col gap-4 p-6">
        <div>
          <h2 id="will-heading" className="card-title">How you feel about risk</h2>
          <p className="text-slate-400">Six short questions, all optional. Answer at least four and your willingness shows above. Kept in your own Ledger.</p>
        </div>
        {RISK_QUESTIONS.map((q) => (
          <fieldset key={q.id} className="flex flex-col gap-2">
            <legend className="mb-1 font-medium text-ink">{q.text}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((label, i) => {
                const value = (i + 1) as 1 | 2 | 3 | 4
                const on = answers[q.id] === value
                return (
                  <label key={label} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 ${on ? 'border-brand bg-tint text-ink' : 'border-line text-slate-300 hover:border-line-strong'}`}>
                    <input type="radio" name={`risk-${q.id}`} className="accent-brand" checked={on} onChange={() => setAnswers((a) => ({ ...a, [q.id]: value }))} />
                    {label}
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !changed && <p className="text-good" role="status">Saved in your Ledger.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={saving || !changed} onClick={() => void submit()}>{saving ? 'Saving…' : 'Save answers'}</button>
          {Object.keys(answers).length > 0 && <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setAnswers({})}>Clear</button>}
        </div>
      </section>
    </>
  )
}
