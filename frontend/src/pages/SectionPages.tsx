import { ArrowLeftRight, Target, Wallet } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useSetup } from '../context/SetupContext'

export function AccountsPage() {
  const { aiEnabled, openDetailedSetup } = useSetup()
  return (
    <>
      <PageHeader eyebrow="Finance" title="Accounts" description="Bank, card, loan and investment accounts in one place." />
      <div className="card">
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description={aiEnabled ? "Account connections are on the way. Meanwhile, tell Aarya about your investments so your profile is ready when they arrive." : "Account connections are on the way. Your bank, card and investment accounts will appear here."}
          action={aiEnabled && (
            <button type="button" className="btn btn-primary" onClick={() => openDetailedSetup('investments')}>
              Set up investments
            </button>
          )}
        />
      </div>
    </>
  )
}

export function TransactionsPage() {
  const { aiEnabled, openDetailedSetup } = useSetup()
  return (
    <>
      <PageHeader eyebrow="Finance" title="Transactions" description="Every payment in and out, categorised automatically." />
      <div className="card">
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions yet"
          description={aiEnabled ? "Transactions appear here once your accounts are added. You can already choose how spending should be categorised." : "Transactions appear here once your accounts are added."}
          action={aiEnabled && (
            <button type="button" className="btn btn-primary" onClick={() => openDetailedSetup('categories')}>
              Choose categories
            </button>
          )}
        />
      </div>
    </>
  )
}

export function GoalsPage() {
  const { aiEnabled, openDetailedSetup } = useSetup()
  return (
    <>
      <PageHeader eyebrow="Finance" title="Goals" description="Track progress towards what matters to you." />
      <div className="card">
        <EmptyState
          icon={Target}
          title="No goals yet"
          description={aiEnabled ? "Tell Aarya what you are saving for — a deadline and an amount is all it needs to plan the path." : "Goal tracking is on the way. Your savings goals and progress will appear here."}
          action={aiEnabled && (
            <button type="button" className="btn btn-primary" onClick={() => openDetailedSetup('goals')}>
              Set up goals
            </button>
          )}
        />
      </div>
    </>
  )
}
