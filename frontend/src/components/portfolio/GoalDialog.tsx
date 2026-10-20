import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { accountType, type Goal, type GoalPriority } from '../../lib/ledger/portfolio'
import { CURRENCIES, formatMoney } from '../../lib/ledger/types'
import { ErrorNote, Field, inputClass, selectClass } from '../ledger/ui'
import { parseNumber } from '../../lib/ledger/money'

const parseNum = (s: string) => parseNumber(s) ?? NaN

function monthsUntil(date: string): number {
  const now = new Date()
  const [y, m] = date.split('-').map(Number)
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
}

/** Add or edit a savings goal. Linking an account makes its balance count as saved. */
export function GoalDialog({ onClose, existing, initialName }: { onClose: () => void; existing?: Goal; initialName?: string }) {
  const { saveGoal, deleteGoal, accounts, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const [name, setName] = useState(existing?.name ?? initialName ?? '')
  const [target, setTarget] = useState(existing ? String(existing.target) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? opts.defaultCurrency)
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? '')
  const [saved, setSaved] = useState(existing?.saved ? String(existing.saved) : '')
  const [monthly, setMonthly] = useState(existing?.monthly ? String(existing.monthly) : '')
  const [accountId, setAccountId] = useState(existing?.accountId ?? '')
  const [priority, setPriority] = useState<GoalPriority>(existing?.priority ?? 'medium')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const savingAccounts = accounts.filter((a) => ['cash', 'investments', 'retirement'].includes(accountType(a.type).group) && a.currency === currency)
  const linked = accounts.find((a) => a.id === accountId)
  const t = parseNum(target)
  const s = linked ? linked.balance : saved.trim() ? parseNum(saved) : 0
  const months = targetDate ? monthsUntil(targetDate) : 0
  const needed = Number.isFinite(t) && t > s && months > 0 ? (t - s) / months : null

  const submit = async () => {
    setLocalError(null)
    const m = monthly.trim() ? parseNum(monthly) : 0
    if (!name.trim()) return setLocalError('Name the goal, for example “Emergency fund” or “Holiday 2027”.')
    if (!Number.isFinite(t) || t <= 0) return setLocalError('Enter the amount you want to reach.')
    if (!Number.isFinite(s) || s < 0) return setLocalError('Enter what is saved so far (0 or more).')
    if (!Number.isFinite(m) || m < 0) return setLocalError('Enter a monthly amount of 0 or more.')
    try {
      await saveGoal(
        {
          name: name.trim().slice(0, 80),
          target: Math.round(t * 100) / 100,
          currency,
          targetDate,
          saved: linked ? 0 : Math.round(s * 100) / 100,
          monthly: Math.round(m * 100) / 100,
          accountId,
          priority,
          notes: notes.trim().slice(0, 1000),
        },
        existing,
      )
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add goal'}
      subtitle="Saved to the Goals tab of your Ledger"
      fitContent
      footer={
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <button
              type="button"
              className={`btn btn-ghost ${confirmDelete ? 'text-red-300' : ''}`}
              disabled={busy}
              onClick={() => (confirmDelete ? void deleteGoal(existing).then(onClose, () => undefined) : setConfirmDelete(true))}
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
              {existing ? 'Save' : 'Add goal'}
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
        <Field label="Goal" htmlFor="goal-name">
          <input id="goal-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Emergency fund" autoFocus={!existing} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Target amount" htmlFor="goal-target">
            <input id="goal-target" inputMode="decimal" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Currency" htmlFor="goal-cur">
            <select id="goal-cur" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {Array.from(new Set([currency, ...CURRENCIES])).map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="By when (optional)" htmlFor="goal-date">
            <input id="goal-date" type="date" className={inputClass} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
          <Field label="Priority" htmlFor="goal-prio">
            <select id="goal-prio" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value as GoalPriority)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>
        <Field label="Saved in" htmlFor="goal-acc" hint={savingAccounts.length ? 'Pick an account set aside for this goal, and its balance counts as saved.' : 'Add a savings account on the Accounts page to link it here.'}>
          <select id="goal-acc" className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Not linked to an account</option>
            {savingAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {formatMoney(a.balance, a.currency)}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {!linked && (
            <Field label="Saved so far" htmlFor="goal-saved">
              <input id="goal-saved" inputMode="decimal" className={inputClass} value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
            </Field>
          )}
          <Field label="Monthly saving" htmlFor="goal-monthly" hint={needed !== null ? `About ${formatMoney(Math.ceil(needed), currency)} a month reaches it on time.` : undefined}>
            <input id="goal-monthly" inputMode="decimal" className={inputClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder={needed !== null ? String(Math.ceil(needed)) : '0'} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="goal-notes">
          <textarea id="goal-notes" rows={2} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <ErrorNote>{localError || error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
