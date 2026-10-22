import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useLedger } from '../context/LedgerContext'
import { usePeriodMode } from '../hooks/usePeriodMode'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { BudgetCard } from '../components/overview/BudgetCard'
import { BudgetDialog } from '../components/overview/BudgetDialog'
import { budgetProgress } from '../lib/ledger/budgets'
import { buildPeriods, type Period } from '../lib/ledger/periods'
import { currenciesByUse, inSpan, monthName } from '../lib/ledger/summary'
import { todayIso } from '../lib/ledger/types'

const span = (p: Period) => ({ start: p.start, end: p.end })

/**
 * Budgets (sidebar and phone tab). First version: this month's or this cycle's budgets, same as the
 * Overview card, with editing. The full design page (suggestions, history) follows.
 */
export function BudgetsPage() {
  const { status, transactions, budgets } = useLedger()
  const [mode] = usePeriodMode()
  const [editing, setEditing] = useState(false)
  const currency = useMemo(() => currenciesByUse(transactions)[0] ?? 'EUR', [transactions])

  const period = useMemo(() => {
    const today = todayIso()
    const salary = mode === 'salary' ? buildPeriods('salary', transactions, today) : []
    const periods = salary.length ? salary : buildPeriods('calendar', transactions, today)
    const withData = periods.filter((p) => transactions.some((t) => inSpan(t.date, span(p))))
    return { cur: withData.at(-1) ?? periods.at(-1), salary: salary.length > 0 }
  }, [mode, transactions])

  const rows = useMemo(
    () => (period.cur ? budgetProgress(budgets, transactions, span(period.cur), currency) : []),
    [budgets, transactions, period, currency],
  )

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Budgets" />
        <section className="card" aria-label="Connect Google Drive">
          <ConnectDrive context="transactions" />
        </section>
      </>
    )
  }

  const noun = period.salary ? 'this cycle' : 'this month'
  const title = period.cur ? (period.salary ? `Cycle from ${period.cur.start}` : monthName(period.cur.start.slice(0, 7))) : ''

  return (
    <>
      <PageHeader
        title="Budgets"
        description={title ? `${title} · ${currency}` : undefined}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Edit budgets
          </button>
        }
      />
      <section className="card" aria-label={`Budgets ${noun}`}>
        <BudgetCard rows={rows} currency={currency} noun={noun} hasBudgets={budgets.some((b) => b.currency === currency)} onEdit={() => setEditing(true)} />
      </section>
      {editing && <BudgetDialog onClose={() => setEditing(false)} currency={currency} budgets={budgets} />}
    </>
  )
}
