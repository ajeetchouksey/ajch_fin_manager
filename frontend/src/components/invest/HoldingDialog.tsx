import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { accountType } from '../../lib/ledger/portfolio'
import { HOLDING_CLASSES, holdingProblem, type Holding, type HoldingClass } from '../../lib/ledger/holdings'
import { parseNumber } from '../../lib/ledger/money'
import { CURRENCIES, todayIso } from '../../lib/ledger/types'
import { ErrorNote, Field, inputClass, selectClass } from '../ledger/ui'

const optionalNumber = (s: string): number | null => (s.trim() === '' ? null : (parseNumber(s) ?? NaN))

/** Add or edit one holding inside an investment or retirement account. The price is the one you enter; FinBuddy does not fetch prices. */
export function HoldingDialog({ onClose, existing, accountId }: { onClose: () => void; existing?: Holding; accountId?: string }) {
  const { saveHolding, deleteHolding, accounts, busy, error } = useLedger()
  const choices = accounts.filter((a) => ['investments', 'retirement'].includes(accountType(a.type).group))
  const [account, setAccount] = useState(existing?.accountId ?? accountId ?? choices[0]?.id ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [isin, setIsin] = useState(existing?.isin ?? '')
  const [symbol, setSymbol] = useState(existing?.symbol ?? '')
  const [assetClass, setAssetClass] = useState<HoldingClass>(existing?.assetClass ?? 'funds')
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '')
  const [avgCost, setAvgCost] = useState(existing?.avgCost != null ? String(existing.avgCost) : '')
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : '')
  const [priceDate, setPriceDate] = useState(existing?.priceDate ?? '')
  const [currency, setCurrency] = useState(existing?.currency ?? choices.find((a) => a.id === account)?.currency ?? 'EUR')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submit = async () => {
    setLocalError(null)
    const qty = parseNumber(quantity) ?? NaN
    const cost = optionalNumber(avgCost)
    const unit = optionalNumber(price)
    if (Number.isNaN(cost) || Number.isNaN(unit)) return setLocalError('Enter the cost and the price as numbers, or leave them empty.')
    const draft = {
      accountId: account,
      name: name.trim().slice(0, 80),
      isin: isin.trim().toUpperCase(),
      symbol: symbol.trim().slice(0, 20),
      assetClass,
      quantity: Number.isFinite(qty) ? qty : 0,
      avgCost: cost,
      currency,
      price: unit,
      priceDate: unit !== null ? priceDate || todayIso() : '',
      notes: notes.trim().slice(0, 1000),
    }
    const problem = holdingProblem(draft)
    if (problem) return setLocalError(problem)
    try {
      await saveHolding(draft, existing)
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add holding'}
      subtitle="Saved to the Holdings tab of your Ledger. The price is the one you enter."
      fitContent
      footer={
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <button
              type="button"
              className={`btn btn-ghost ${confirmDelete ? 'text-red-300' : ''}`}
              disabled={busy}
              onClick={() => (confirmDelete ? void deleteHolding(existing).then(onClose, () => undefined) : setConfirmDelete(true))}
            >
              <Trash2 className="h-4 w-4" /> {confirmDelete ? 'Yes, remove' : 'Remove'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || choices.length === 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {existing ? 'Save' : 'Add holding'}
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
        {choices.length === 0 && <p className="text-slate-300">Add an investment or retirement account on the Accounts page first; holdings live inside one.</p>}
        <Field label="Held in" htmlFor="hold-acc">
          <select
            id="hold-acc"
            className={selectClass}
            value={account}
            onChange={(e) => {
              setAccount(e.target.value)
              const c = choices.find((a) => a.id === e.target.value)?.currency
              if (c && !existing) setCurrency(c)
            }}
          >
            {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Name" htmlFor="hold-name">
          <input id="hold-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. World equity ETF" autoFocus={!existing} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ISIN (optional)" htmlFor="hold-isin">
            <input id="hold-isin" className={inputClass} value={isin} onChange={(e) => setIsin(e.target.value)} maxLength={12} placeholder="IE00B4L5Y983" />
          </Field>
          <Field label="Symbol (optional)" htmlFor="hold-symbol">
            <input id="hold-symbol" className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={20} />
          </Field>
          <Field label="Kind" htmlFor="hold-class">
            <select id="hold-class" className={selectClass} value={assetClass} onChange={(e) => setAssetClass(e.target.value as HoldingClass)}>
              {HOLDING_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Units held" htmlFor="hold-qty" hint="Fractions are fine.">
            <input id="hold-qty" inputMode="decimal" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Currency" htmlFor="hold-cur">
            <select id="hold-cur" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {Array.from(new Set([currency, ...CURRENCIES])).map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Average cost per unit (optional)" htmlFor="hold-cost">
            <input id="hold-cost" inputMode="decimal" className={inputClass} value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Latest price per unit (optional)" htmlFor="hold-price">
            <input id="hold-price" inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        {price.trim() !== '' && (
          <Field label="Price as of" htmlFor="hold-pdate" hint="Today when left empty.">
            <input id="hold-pdate" type="date" className={inputClass} value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
          </Field>
        )}
        <Field label="Notes" htmlFor="hold-notes">
          <textarea id="hold-notes" rows={2} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <ErrorNote>{localError || error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
