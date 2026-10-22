import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check as CheckIcon, Sparkles } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { useLedgerOptions } from '../../hooks/useLedgerOptions'
import { worthChecking, type Check } from '../../lib/ledger/checks'
import { merchantText } from '../../lib/ledger/categorize'

const DISMISSED_KEY = 'aarya.dismissedChecks'
const SHOW = 3

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
    <section aria-labelledby="checks-heading" className="card-tint flex flex-col gap-3 p-6">
      <h2 id="checks-heading" className="card-title flex items-center gap-2">
        <Sparkles className="h-[18px] w-[18px] text-brand" aria-hidden />
        Worth checking
        <span className="ml-auto font-sans text-sm font-medium text-slate-400">{checks.length}</span>
      </h2>
      {done && <p className="rounded-xl bg-surface px-3.5 py-3 text-good" role="status">{done}</p>}
      {error && <p className="rounded-xl bg-warn-bg px-3.5 py-3 text-warn-text" role="alert">{error}</p>}
      {visible.map((c) => {
        const q = searchFor(c)
        return (
          <div key={c.id} className="flex flex-col gap-2 rounded-xl bg-surface px-3.5 py-3 leading-[1.45]">
            <p className="font-medium text-ink">{c.title}</p>
            <p className="text-slate-300">{c.detail}</p>
            <div className="flex flex-wrap items-center gap-2">
              {c.suggestedCategory && (
                <button type="button" className="btn btn-secondary min-h-9 px-3" disabled={busy} onClick={() => void apply(c)}>
                  <CheckIcon className="h-4 w-4" aria-hidden /> Make {c.suggestedCategory}
                </button>
              )}
              {!c.suggestedCategory && q && (
                <Link to={`/transactions?q=${encodeURIComponent(q)}`} className="btn btn-secondary min-h-9 px-3">Show</Link>
              )}
              <button type="button" className="ml-auto text-sm font-medium text-slate-400 hover:text-ink" onClick={() => dismiss(c)}>
                Hide
              </button>
            </div>
          </div>
        )
      })}
      {checks.length > SHOW && (
        <button type="button" className="self-start font-semibold text-accent" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${checks.length}`}
        </button>
      )}
    </section>
  )
}
