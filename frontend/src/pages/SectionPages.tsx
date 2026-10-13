import { Target, Wallet } from 'lucide-react'
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
          description={aiEnabled ? "Account connections are on the way. Meanwhile, tell Aarya about your investments so your profile is ready when they arrive." : "Account connections are on the way. Meanwhile, add the kinds of investments you hold so your profile is ready."}
          action={(
            <button type="button" className="btn btn-primary" onClick={() => openDetailedSetup('investments')}>
              Set up investments
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
          description={aiEnabled ? "Tell Aarya what you are saving for — a deadline and an amount is all it needs to plan the path." : "Pick what you are saving for. Amounts, dates and progress tracking come next."}
          action={(
            <button type="button" className="btn btn-primary" onClick={() => openDetailedSetup('goals')}>
              Set up goals
            </button>
          )}
        />
      </div>
    </>
  )
}
