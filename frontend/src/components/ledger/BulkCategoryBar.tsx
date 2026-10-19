import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { planRecategorise, type CategoryChange } from '../../lib/ledger/bulk'
import type { Transaction } from '../../lib/ledger/types'
import { ErrorNote, selectClass } from './ui'

/** How long the Undo offer stays on screen after a bulk change */
const UNDO_SECONDS = 10
const REVIEW_LIMIT = 8

/**
 * Changes the category of the selected transactions. The user sees each change first, can undo for
 * 10 seconds after applying, and money in or out never moves to a category of the other kind.
 */
export function BulkCategoryBar({ selected, onDone }: { selected: Transaction[]; onDone: () => void }) {
  const { updateTransactions, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const [category, setCategory] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [undo, setUndo] = useState<{ before: Transaction[]; count: number; left: number } | null>(null)

  const expense = useMemo(() => new Set(opts.expenseCategories), [opts.expenseCategories])
  const income = useMemo(() => new Set(opts.incomeCategories), [opts.incomeCategories])
  const categories = useMemo(() => Array.from(new Set([...opts.expenseCategories, ...opts.incomeCategories])).sort(), [opts])

  const plan = useMemo(
    () => (category ? planRecategorise(selected, category, (d, c) => (d === 'in' ? income.has(c) : expense.has(c))) : null),
    [selected, category, expense, income],
  )

  // Counts down the undo offer, then drops it
  useEffect(() => {
    if (!undo) return
    if (undo.left <= 0) {
      setUndo(null)
      return
    }
    const timer = setTimeout(() => setUndo((u) => (u ? { ...u, left: u.left - 1 } : u)), 1000)
    return () => clearTimeout(timer)
  }, [undo])

  const apply = async () => {
    if (!plan || plan.changes.length === 0) return
    const before = plan.changes.map((c: CategoryChange) => c.before)
    try {
      await updateTransactions(plan.changes.map((c) => c.after))
      setUndo({ before, count: before.length, left: UNDO_SECONDS })
      setReviewing(false)
      setCategory('')
      onDone()
    } catch {
      /* shown by the error note */
    }
  }

  const undoChange = async () => {
    if (!undo) return
    try {
      await updateTransactions(undo.before)
      setUndo(null)
    } catch {
      /* shown by the error note */
    }
  }

  return (
    <div className="space-y-3">
      {error && <ErrorNote>{error}</ErrorNote>}

      {undo && (
        <div role="status" className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm shadow-lg">
          <span className="text-slate-200">Changed {undo.count} {undo.count === 1 ? 'transaction' : 'transactions'}.</span>
          <button type="button" className="btn btn-ghost" onClick={() => void undoChange()} disabled={busy}>
            Undo ({undo.left}s)
          </button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-3 card space-y-3 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-200 sm:flex-1">{selected.length} selected · change category</p>
            <select className={`${selectClass} sm:w-64`} value={category} onChange={(e) => { setCategory(e.target.value); setReviewing(false) }} aria-label="New category">
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={!plan || plan.changes.length === 0 || busy} onClick={() => setReviewing(true)}>
              Review {plan ? plan.changes.length : 0}
            </button>
          </div>

          {plan && plan.skipped > 0 && (
            <p className="text-xs text-amber-200">{plan.skipped} skipped: money in and money out need their own kind of category.</p>
          )}

          {reviewing && plan && (
            <div className="space-y-3 border-t border-line pt-3">
              <ul className="space-y-1 text-sm">
                {plan.changes.slice(0, REVIEW_LIMIT).map((c) => (
                  <li key={c.before.id} className="flex flex-wrap gap-x-2 text-slate-300">
                    <span className="min-w-0 truncate text-white">{c.before.description}</span>
                    <span className="text-slate-500">{c.before.category || 'No category'} → {c.after.category}</span>
                  </li>
                ))}
              </ul>
              {plan.changes.length > REVIEW_LIMIT && <p className="text-xs text-slate-500">and {plan.changes.length - REVIEW_LIMIT} more</p>}
              {plan.unchanged + plan.transfers > 0 && (
                <p className="text-xs text-slate-500">
                  Left as they are: {plan.unchanged} already in this category{plan.transfers ? `, ${plan.transfers} transfers` : ''}.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setReviewing(false)} disabled={busy}>Back</button>
                <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}Apply to {plan.changes.length}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
