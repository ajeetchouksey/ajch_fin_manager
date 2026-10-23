import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { describePlan, monthlyEquivalent, plannedMonthly, planState, type Plan, type PlanState } from '../../lib/ledger/plans'
import { formatMoney, todayIso } from '../../lib/ledger/types'
import { PlanDialog } from './PlanDialog'

const STATE_LABEL: Record<PlanState, string> = { running: 'Running', upcoming: 'Not started', ended: 'Ended' }

/** What the user plans to invest, now or later, optionally for a goal. Intentions only: nothing here moves money. */
export function PlansSection() {
  const { plans, goals } = useLedger()
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  const today = todayIso()
  const totals = useMemo(() => [...plannedMonthly(plans, today)], [plans, today])
  const goalName = (id: string) => goals.find((g) => g.id === id)?.name

  return (
    <section aria-labelledby="plans-heading" className="card flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="plans-heading" className="card-title">Planned investments</h2>
          <p className="text-slate-400">
            What you intend to put aside, now or later, and for which goal. A plan is an intention; it moves no money and changes no balance.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden /> Add a plan
        </button>
      </div>

      {plans.length === 0 ? (
        <p className="text-slate-400">No plans yet. Add one, for example a monthly amount towards a goal, or a lump sum you expect later.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {plans.map((p) => {
              const state = planState(p, today)
              const goal = goalName(p.goalId)
              return (
                <li key={p.id} className={`flex items-start justify-between gap-3 py-3 ${state === 'ended' ? 'opacity-60' : ''}`}>
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{p.name}</span>
                    <span className="block text-sm text-slate-400">
                      {describePlan(p, formatMoney)}
                      {goal ? ` - for ${goal}` : ''}
                    </span>
                    {p.frequency !== 'monthly' && p.frequency !== 'once' && (
                      <span className="block text-sm text-slate-400">About {formatMoney(monthlyEquivalent(p), p.currency)} a month</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-tint px-2 py-0.5 text-xs font-semibold text-ink">{STATE_LABEL[state]}</span>
                    <button type="button" className="btn btn-ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                      <Pencil size={16} aria-hidden />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          {totals.length > 0 && (
            <p className="text-sm text-slate-300">
              Regular plans come to about {totals.map(([currency, v]) => formatMoney(v, currency)).join(' and ')} a month. One-time amounts are not counted.
            </p>
          )}
        </>
      )}

      {editing && <PlanDialog existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}
