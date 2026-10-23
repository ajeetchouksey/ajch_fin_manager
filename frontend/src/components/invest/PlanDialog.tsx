import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { accountType } from '../../lib/ledger/portfolio'
import { PLAN_FREQUENCIES, planProblem, type Plan, type PlanFrequency } from '../../lib/ledger/plans'
import { parseNumber } from '../../lib/ledger/money'
import { CURRENCIES, formatMoney } from '../../lib/ledger/types'
import { ErrorNote, Field, inputClass, selectClass } from '../ledger/ui'

/** Add or edit a planned investment: an intention to put money aside, not a payment. */
export function PlanDialog({ onClose, existing }: { onClose: () => void; existing?: Plan }) {
  const { savePlan, deletePlan, accounts, goals, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const [name, setName] = useState(existing?.name ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? opts.defaultCurrency)
  const [frequency, setFrequency] = useState<PlanFrequency>(existing?.frequency ?? 'monthly')
  const [startDate, setStartDate] = useState(existing?.startDate ?? '')
  const [endDate, setEndDate] = useState(existing?.endDate ?? '')
  const [goalId, setGoalId] = useState(existing?.goalId ?? '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const once = frequency === 'once'
  const goalChoices = goals.filter((g) => g.currency === currency)
  const accountChoices = accounts.filter((a) => ['investments', 'retirement'].includes(accountType(a.type).group) && a.currency === currency)

  const submit = async () => {
    setLocalError(null)
    const value = parseNumber(amount) ?? NaN
    const draft = {
      name: name.trim().slice(0, 80),
      amount: Number.isFinite(value) ? Math.round(value * 100) / 100 : 0,
      currency,
      frequency,
      startDate,
      endDate: once ? '' : endDate,
      goalId: goalChoices.some((g) => g.id === goalId) ? goalId : '',
      accountId: accountChoices.some((a) => a.id === accountId) ? accountId : '',
      notes: notes.trim().slice(0, 1000),
    }
    const problem = planProblem(draft)
    if (problem) return setLocalError(problem)
    try {
      await savePlan(draft, existing)
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add planned investment'}
      subtitle="Saved to the Plans tab of your Ledger. A plan is an intention; it moves no money."
      fitContent
      footer={
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <button
              type="button"
              className={`btn btn-ghost ${confirmDelete ? 'text-red-300' : ''}`}
              disabled={busy}
              onClick={() => (confirmDelete ? void deletePlan(existing).then(onClose, () => undefined) : setConfirmDelete(true))}
            >
              <Trash2 className="h-4 w-4" /> {confirmDelete ? 'Yes, remove' : 'Remove'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {existing ? 'Save' : 'Add plan'}
            </button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-5 px-4 py-5 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="What is it for" htmlFor="plan-name">
          <input id="plan-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Monthly investing" autoFocus={!existing} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount" htmlFor="plan-amount">
            <input id="plan-amount" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Currency" htmlFor="plan-cur">
            <select id="plan-cur" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {Array.from(new Set([currency, ...CURRENCIES])).map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="How often" htmlFor="plan-freq">
          <select id="plan-freq" className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value as PlanFrequency)}>
            {PLAN_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={once ? 'On which date' : 'Starting (optional)'} htmlFor="plan-start">
            <input id="plan-start" type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          {!once && (
            <Field label="Until (optional)" htmlFor="plan-end">
              <input id="plan-end" type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="For which goal" htmlFor="plan-goal" hint={goalChoices.length ? undefined : `No goal in ${currency} yet. You can add one on the Goals page.`}>
          <select id="plan-goal" className={selectClass} value={goalChoices.some((g) => g.id === goalId) ? goalId : ''} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">No particular goal</option>
            {goalChoices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Into which account" htmlFor="plan-acc" hint="Optional. Only investment and retirement accounts are listed.">
          <select id="plan-acc" className={selectClass} value={accountChoices.some((a) => a.id === accountId) ? accountId : ''} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Not decided yet</option>
            {accountChoices.map((a) => <option key={a.id} value={a.id}>{a.name} - {formatMoney(a.balance, a.currency)}</option>)}
          </select>
        </Field>
        <Field label="Notes" htmlFor="plan-notes">
          <textarea id="plan-notes" rows={2} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <ErrorNote>{localError || error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
