import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { accountRemovalImpact } from '../../lib/ledger/removal'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { ACCOUNT_TYPES, GROUP_LABELS, accountType, type Account, type AccountGroup } from '../../lib/ledger/portfolio'
import { CURRENCIES, todayIso } from '../../lib/ledger/types'
import { ErrorNote, Field, inputClass, selectClass } from '../ledger/ui'

const GROUPS: AccountGroup[] = ['cash', 'investments', 'retirement', 'property', 'debt', 'cover']

const parseNum = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))

/** Add or edit an account, investment, debt or insurance policy. */
export function AccountDialog({ onClose, existing, initialType }: { onClose: () => void; existing?: Account; initialType?: string }) {
  const { saveAccount, deleteAccount, transactions, balances, busy, error } = useLedger()
  const impact = existing ? accountRemovalImpact(existing, transactions, balances) : null
  const opts = useLedgerOptions()
  const [type, setType] = useState(existing?.type ?? initialType ?? 'current')
  const [name, setName] = useState(existing?.name ?? '')
  const [institution, setInstitution] = useState(existing?.institution ?? '')
  const [currency, setCurrency] = useState(existing?.currency ?? opts.defaultCurrency)
  const [balance, setBalance] = useState(existing ? String(existing.balance) : '')
  const [asOf, setAsOf] = useState(existing?.asOf || todayIso())
  const [rate, setRate] = useState(existing?.rate !== null && existing?.rate !== undefined ? String(existing.rate) : '')
  const [monthly, setMonthly] = useState(existing?.monthly ? String(existing.monthly) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const t = accountType(type)
  const isCover = t.group === 'cover'
  const isDebt = t.group === 'debt'
  const currencies = Array.from(new Set([currency, opts.defaultCurrency, ...CURRENCIES]))

  const submit = async () => {
    setLocalError(null)
    const b = balance.trim() ? parseNum(balance) : 0
    const r = rate.trim() ? parseNum(rate) : null
    const m = monthly.trim() ? parseNum(monthly) : 0
    if (!name.trim()) return setLocalError('Give it a name, for example “Sparkasse current” or “Trade Republic ETF”.')
    if (!Number.isFinite(b) || b < 0) return setLocalError(isDebt ? 'Enter the amount you still owe (0 or more).' : 'Enter a balance of 0 or more.')
    if (r !== null && (!Number.isFinite(r) || r < -50 || r > 100)) return setLocalError('Enter a yearly rate in %, for example 2.5.')
    if (!Number.isFinite(m) || m < 0) return setLocalError('Enter a monthly amount of 0 or more.')
    try {
      await saveAccount(
        {
          name: name.trim().slice(0, 80),
          type,
          institution: institution.trim().slice(0, 80),
          currency,
          balance: Math.round(b * 100) / 100,
          asOf,
          rate: r,
          monthly: Math.round(m * 100) / 100,
          notes: notes.trim().slice(0, 1000),
        },
        existing,
      )
      onClose()
    } catch {
      /* shown from context */
    }
  }

  const remove = async () => {
    if (!existing) return
    try {
      await deleteAccount(existing)
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add account'}
      subtitle="Saved to the Accounts tab of your Ledger"
      fitContent
      footer={
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            confirmDelete ? (
              <button type="button" className="btn btn-ghost text-red-300" onClick={() => void remove()} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Move to Trash
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {existing ? 'Save' : 'Add'}
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
        {confirmDelete && impact && (
          <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium">Move {existing?.name} to Trash?</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-amber-100/90">
              <li>{impact.transactions === 0 ? 'No transactions use this account.' : `${impact.transactions} ${impact.transactions === 1 ? 'transaction keeps' : 'transactions keep'} the name "${existing?.name}". They are not changed.`}</li>
              <li>{impact.balanceRecords === 0 ? 'No balance history to keep.' : `${impact.balanceRecords} balance ${impact.balanceRecords === 1 ? 'entry is' : 'entries are'} kept and return if you restore the account.`}</li>
              <li>You can restore it from Trash for 30 days.</li>
            </ul>
          </div>
        )}
        <Field label="What is it?" htmlFor="acc-type">
          <select id="acc-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={GROUP_LABELS[g]}>
                {ACCOUNT_TYPES.filter((x) => x.group === g).map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="acc-name">
            <input id="acc-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={isCover ? 'e.g. Haftpflicht' : isDebt ? 'e.g. Car loan' : 'e.g. Sparkasse current'} autoFocus={!existing} />
          </Field>
          <Field label="Bank or provider (optional)" htmlFor="acc-inst">
            <input id="acc-inst" className={inputClass} value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={80} placeholder="e.g. Commerzbank" />
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label={isCover ? 'Sum insured (optional)' : isDebt ? 'Amount still owed' : 'Current balance or value'} htmlFor="acc-bal">
            <input id="acc-bal" inputMode="decimal" className={inputClass} value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Currency" htmlFor="acc-cur">
            <select id="acc-cur" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {!isCover && (
            <Field label="Balance on" htmlFor="acc-asof">
              <input id="acc-asof" type="date" className={inputClass} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </Field>
          )}
          {!isCover && t.value !== 'current' && t.value !== 'cash' && (
            <Field label={isDebt ? 'Interest % a year' : t.group === 'cash' ? 'Interest % a year' : 'Expected return % a year'} htmlFor="acc-rate" hint={rate ? undefined : `Empty = ${t.defaultRate}%`}>
              <input id="acc-rate" inputMode="decimal" className={inputClass} value={rate} onChange={(e) => setRate(e.target.value)} placeholder={String(t.defaultRate)} />
            </Field>
          )}
          {t.monthlyLabel && (
            <Field label={t.monthlyLabel} htmlFor="acc-monthly">
              <input id="acc-monthly" inputMode="decimal" className={inputClass} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" />
            </Field>
          )}
        </div>

        <Field label="Notes" htmlFor="acc-notes" hint="Anything useful: policy number, what it is for, conditions…">
          <textarea id="acc-notes" rows={2} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>

        <ErrorNote>{localError || error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
