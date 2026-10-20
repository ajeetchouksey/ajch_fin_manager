import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from '../Dialog'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { type Budget } from '../../lib/ledger/budgets'
import { ErrorNote, Field, inputClass } from '../ledger/ui'
import { parseNumber } from '../../lib/ledger/money'

const parseNum = (s: string) => parseNumber(s) ?? NaN

/**
 * Sets the monthly limit for each spending category in one currency. Empty means no budget; only
 * the rows that changed are saved.
 */
export function BudgetDialog({ onClose, currency, budgets }: { onClose: () => void; currency: string; budgets: Budget[] }) {
  const { saveBudget, deleteBudget, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const [localError, setLocalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Budgets in this currency, by category
  const existing = new Map(budgets.filter((b) => b.currency === currency).map((b) => [b.category, b]))
  const categories = Array.from(new Set([...opts.expenseCategories, ...existing.keys()]))
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c, existing.get(c)?.monthly ? String(existing.get(c)!.monthly) : ''])),
  )

  const submit = async () => {
    setLocalError(null)
    const changes: Array<() => Promise<unknown>> = []
    for (const c of categories) {
      const raw = (values[c] ?? '').trim()
      const was = existing.get(c)
      if (!raw) {
        if (was) changes.push(() => deleteBudget(was))
        continue
      }
      const n = parseNum(raw)
      if (!Number.isFinite(n) || n <= 0) return setLocalError(`Enter a monthly limit above 0 for ${c}, or leave it empty.`)
      const monthly = Math.round(n * 100) / 100
      if (!was || was.monthly !== monthly) changes.push(() => saveBudget({ category: c, monthly, currency }, was))
    }
    if (!changes.length) return onClose()
    setSaving(true)
    try {
      for (const run of changes) await run()
      onClose()
    } catch {
      /* shown from context */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title="Monthly budgets"
      subtitle={`Limits in ${currency} for each period. Leave a category empty for no budget.`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy || saving} onClick={() => void submit()}>
            {(busy || saving) && <Loader2 className="h-4 w-4 animate-spin" />}
            Save budgets
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <Field key={c} label={c} htmlFor={`budget-${c}`}>
              <input
                id={`budget-${c}`}
                inputMode="decimal"
                className={inputClass}
                placeholder="No budget"
                value={values[c] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <ErrorNote>{localError || error}</ErrorNote>
      </div>
    </Dialog>
  )
}
