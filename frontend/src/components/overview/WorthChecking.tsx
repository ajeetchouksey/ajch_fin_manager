import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check as CheckIcon, Lightbulb, X } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { worthChecking, type Check } from '../../lib/ledger/checks'
import { merchantText } from '../../lib/ledger/categorize'

const DISMISSED_KEY = 'aarya.dismissedChecks'
const SHOW = 4

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-200)))
  } catch {
    /* ignore */
  }
}

/**
 * "Worth checking" on the Overview: the same checks as the connector's worth_checking tool.
 * A check with a suggested category can be applied in one step; nothing changes without a click.
 */
export function WorthChecking() {
  const { transactions, updateTransactions, busy } = useLedger()
  const { ownNames } = useLedgerOptions()
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const [showAll, setShowAll] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checks = useMemo(
    () => worthChecking(transactions, { ownNames }).filter((c) => !dismissed.includes(c.id)),
    [transactions, ownNames, dismissed],
  )
  if (!checks.length && !done) return null

  const dismiss = (c: Check) => {
    const next = [...dismissed, c.id]
    setDismissed(next)
    writeDismissed(next)
  }

  const apply = async (c: Check) => {
    if (!c.suggestedCategory) return
    const ids = new Set(c.transactionIds)
    const changed = transactions.filter((t) => ids.has(t.id)).map((t) => ({ ...t, category: c.suggestedCategory! }))
    setError(null)
    try {
      await updateTransactions(changed)
      setDone(`${changed.length} payment${changed.length === 1 ? '' : 's'} moved to ${c.suggestedCategory}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change. Try again.')
    }
  }

  const visible = showAll ? checks : checks.slice(0, SHOW)
  const searchFor = (c: Check) => {
    const first = transactions.find((t) => t.id === c.transactionIds[0])
    return first ? merchantText(first.description).split(/[,/]/)[0].trim().slice(0, 40) : ''
  }

  return (
    <section aria-labelledby="checks-heading" className="card">
      <div className="flex items-center gap-2 px-5 pt-5 sm:px-6">
        <Lightbulb className="h-5 w-5 text-amber-200" aria-hidden />
        <h2 id="checks-heading" className="text-lg font-semibold text-ink">Worth checking</h2>
        <span className="ml-auto text-sm text-slate-400">{checks.length}</span>
      </div>
      {done && <p className="mx-5 mt-3 rounded-lg bg-brand-success/10 px-3 py-2 text-sm text-emerald-200 sm:mx-6" role="status">{done}</p>}
      {error && <p className="mx-5 mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200 sm:mx-6" role="alert">{error}</p>}
      <ul className="divide-y divide-white/5 px-5 py-2 sm:px-6">
        {visible.map((c) => {
          const q = searchFor(c)
          return (
            <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-100">{c.title}</p>
                <p className="mt-0.5 text-sm text-slate-400">{c.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.suggestedCategory && (
                  <button type="button" className="btn btn-secondary min-h-9 px-3 text-sm" disabled={busy} onClick={() => void apply(c)}>
                    <CheckIcon className="h-4 w-4" aria-hidden /> Make {c.suggestedCategory}
                  </button>
                )}
                {!c.suggestedCategory && q && (
                  <Link to={`/transactions?q=${encodeURIComponent(q)}`} className="btn btn-secondary min-h-9 px-3 text-sm">Show</Link>
                )}
                <button type="button" className="icon-btn" aria-label={`Hide: ${c.title}`} onClick={() => dismiss(c)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {checks.length > SHOW && (
        <div className="px-5 pb-4 sm:px-6">
          <button type="button" className="text-sm font-medium text-brand-soft hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${checks.length}`}
          </button>
        </div>
      )}
    </section>
  )
}
