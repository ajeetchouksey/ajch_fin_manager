import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLedger } from '../../context/LedgerContext'
import { cleanInvestorProfile } from '../../lib/ledger/investor'
import { ability, abilityFactors, ledgerRiskInputs, willingness } from '../../lib/ledger/risk'
import { goalScenarios, scenarioWarnings, type GoalScenario } from '../../lib/ledger/scenarios'
import { formatMoney, todayIso } from '../../lib/ledger/types'

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`

function ScenarioCard({ s }: { s: GoalScenario }) {
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="card-title">{s.name}</h3>
          <p className="text-sm text-slate-400">
            {formatMoney(s.target, s.currency)} by {s.targetDate.slice(0, 7)} - {formatMoney(s.current, s.currency)} set aside, {formatMoney(s.monthly, s.currency)} a month
            {s.source === 'plans' ? ' from your plans' : ''}
          </p>
        </div>
        <span className="rounded-full bg-tint px-2.5 py-0.5 text-sm font-semibold text-ink">
          {s.neededRate === null ? 'Out of reach' : s.neededRate === 0 ? 'Saving alone is enough' : `Needs about ${pct(s.neededRate)} a year`}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {s.cases.map((c) => {
          const width = Math.max(2, Math.min(100, (c.value / s.target) * 100))
          return (
            <li key={c.id} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium text-ink">{c.label} <span className="font-normal text-slate-400">({pct(c.rate)} a year)</span></span>
                <span className="tabular-nums text-ink">{formatMoney(c.value, s.currency)}</span>
              </span>
              <span className="block h-2 overflow-hidden rounded-full bg-tint" role="img" aria-label={`${Math.round((c.value / s.target) * 100)} percent of the target`}>
                <span className="block h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
              </span>
              <span className="text-sm text-slate-400">
                {c.reaches ? 'Reaches the target.' : `Short by ${formatMoney(c.short, s.currency)}.`}
                {c.monthlyNeeded > 0 ? ` About ${formatMoney(c.monthlyNeeded, s.currency)} a month would get there.` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

/** Where each investing goal lands under a few illustrative returns, what it needs, and where your plan and your answers disagree. */
export function ScenariosSection() {
  const { accounts, balances, transactions, goals, plans, profile } = useLedger()
  const stored = useMemo(() => cleanInvestorProfile(profile?.investorProfile), [profile])
  const today = todayIso()
  const view = useMemo(() => {
    const data = { transactions, accounts, balances, goals, householdMembers: profile?.householdMembers, investor: stored, today }
    const scenarios = goalScenarios(data, plans)
    const ab = ability(abilityFactors(ledgerRiskInputs(data).ability))
    const warnings = scenarioWarnings(scenarios, ab.level, willingness(stored.riskAnswers).level, formatMoney)
    return { scenarios, warnings }
  }, [transactions, accounts, balances, goals, plans, profile, stored, today])

  return (
    <section aria-labelledby="scenarios-heading" className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2 p-6">
        <h2 id="scenarios-heading" className="card-title">Where your goals could land</h2>
        <p className="text-slate-400">
          For each goal paid for from an investment or retirement account: the value on its date at three illustrative yearly returns, and the return it needs. These are cases to compare, not forecasts.
        </p>
        {view.scenarios.length === 0 && (
          <p className="text-slate-300">
            Nothing to show yet. A goal needs a target, a date and an investment or retirement account linked to it. <Link to="/goals" className="font-semibold text-accent">Set goals</Link>
          </p>
        )}
      </div>

      {view.warnings.length > 0 && (
        <div role="note" className="card-tint flex flex-col gap-2 p-5">
          <h3 className="card-title">Worth a look</h3>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-slate-300">
            {view.warnings.map((w) => <li key={w.id}>{w.text}</li>)}
          </ul>
        </div>
      )}

      {view.scenarios.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {view.scenarios.map((s) => <ScenarioCard key={s.id} s={s} />)}
          </ul>
          <p className="text-sm text-slate-400">
            Fees, tax and inflation are not included, and one-time amounts are left out. Returns are not guaranteed and can be negative. General information, not advice.
          </p>
        </>
      )}
    </section>
  )
}
