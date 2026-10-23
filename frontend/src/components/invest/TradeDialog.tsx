import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { parseNumber } from '../../lib/ledger/money'
import { TRADE_TYPES, tradeProblem, type Trade, type TradeType } from '../../lib/ledger/trades'
import { todayIso } from '../../lib/ledger/types'
import { ErrorNote, Field, inputClass, selectClass } from '../ledger/ui'

const amount = (s: string): number => (s.trim() === '' ? 0 : (parseNumber(s) ?? NaN))

/** Add or edit a buy, a sell or a dividend of one holding. Its units and average cost follow from all its trades. */
export function TradeDialog({ holdingId, onClose, existing }: { holdingId: string; onClose: () => void; existing?: Trade }) {
  const { saveTrade, deleteTrade, holdings, busy, error } = useLedger()
  const holding = holdings.find((h) => h.id === holdingId)
  const [type, setType] = useState<TradeType>(existing?.type ?? 'buy')
  const [date, setDate] = useState(existing?.date ?? todayIso())
  const [quantity, setQuantity] = useState(existing?.quantity ? String(existing.quantity) : '')
  const [price, setPrice] = useState(existing?.price ? String(existing.price) : '')
  const [received, setReceived] = useState(existing?.amount ? String(existing.amount) : '')
  const [fee, setFee] = useState(existing?.fee ? String(existing.fee) : '')
  const [tax, setTax] = useState(existing?.tax ? String(existing.tax) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dividend = type === 'dividend'
  const currency = holding?.currency ?? existing?.currency ?? 'EUR'

  const submit = async () => {
    setLocalError(null)
    const values = { quantity: amount(quantity), price: amount(price), amount: amount(received), fee: amount(fee), tax: amount(tax) }
    if (Object.values(values).some((v) => Number.isNaN(v))) return setLocalError('Enter numbers only, or leave a field empty.')
    const draft = {
      holdingId,
      accountId: holding?.accountId ?? existing?.accountId ?? '',
      date,
      type,
      quantity: dividend ? 0 : values.quantity,
      price: dividend ? 0 : values.price,
      amount: dividend ? values.amount : 0,
      fee: values.fee,
      tax: values.tax,
      currency,
      notes: notes.trim().slice(0, 1000),
    }
    const problem = tradeProblem(draft, todayIso())
    if (problem) return setLocalError(problem)
    try {
      await saveTrade(draft, existing)
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title={existing ? 'Edit trade' : `Add trade${holding ? ` - ${holding.name}` : ''}`}
      subtitle="Saved to the Trades tab of your Ledger. Units and average cost are worked out from all trades."
      fitContent
      footer={
        <div className="flex items-center justify-between gap-2">
          {existing ? (
            <button
              type="button"
              className={`btn btn-ghost ${confirmDelete ? 'text-red-300' : ''}`}
              disabled={busy}
              onClick={() => (confirmDelete ? void deleteTrade(existing).then(onClose, () => undefined) : setConfirmDelete(true))}
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
              {existing ? 'Save' : 'Add trade'}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What happened" htmlFor="trade-type">
            <select id="trade-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as TradeType)}>
              {TRADE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Date" htmlFor="trade-date">
            <input id="trade-date" type="date" className={inputClass} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {dividend ? (
          <Field label={`Amount received (${currency})`} htmlFor="trade-amount" hint="Before tax; enter any tax withheld below.">
            <input id="trade-amount" inputMode="decimal" className={inputClass} value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0.00" autoFocus />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Units" htmlFor="trade-qty">
              <input id="trade-qty" inputMode="decimal" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" autoFocus />
            </Field>
            <Field label={`Price per unit (${currency})`} htmlFor="trade-price">
              <input id="trade-price" inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fees (optional)" htmlFor="trade-fee">
            <input id="trade-fee" inputMode="decimal" className={inputClass} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Tax withheld (optional)" htmlFor="trade-tax">
            <input id="trade-tax" inputMode="decimal" className={inputClass} value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="trade-notes">
          <textarea id="trade-notes" rows={2} className={`${inputClass} py-3`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <ErrorNote>{localError || error}</ErrorNote>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  )
}
