import { Link } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, Check, Tags, Target, UserRound, Wallet, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { useSetup } from '../context/SetupContext'

function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { user } = useAuth()
  const { hasProfile, openQuickSetup, openDetailedSetup } = useSetup()
  const firstName = user?.name?.split(' ')[0]
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  const steps: Array<{ icon: LucideIcon; title: string; description: string; done?: boolean; cta: string; onClick: () => void }> = [
    {
      icon: UserRound,
      title: 'Create your financial profile',
      description: 'A short conversation with Aarya about your household, income and priorities.',
      done: hasProfile === true,
      cta: 'Start',
      onClick: openQuickSetup,
    },
    {
      icon: Target,
      title: 'Set your goals',
      description: 'An emergency fund, a home, retirement — tell Aarya what you are working towards.',
      cta: 'Set goals',
      onClick: () => openDetailedSetup('goals'),
    },
    {
      icon: Tags,
      title: 'Choose spending categories',
      description: 'Decide how expenses are grouped so reports match the way you think about money.',
      cta: 'Choose',
      onClick: () => openDetailedSetup('categories'),
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <>
      <PageHeader eyebrow={today} title={firstName ? <>{greeting()}, <span className="heading-gradient">{firstName}</span></> : greeting()} description="Let's get your finances organised." />

      {/* Getting started */}
      <section aria-labelledby="getting-started" className="card card-accent-top overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="getting-started" className="text-xl font-semibold text-white">
              Getting started
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {doneCount} of {steps.length} complete
            </p>
          </div>
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-line sm:block" aria-hidden>
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        </div>

        <ol className="divide-y divide-line">
          {steps.map(({ icon: Icon, title, description, done, cta, onClick }, i) => (
            <li key={title} className="flex items-start gap-4 px-5 py-4 sm:items-center sm:px-6">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  done ? 'bg-brand-success/15 text-brand-success' : 'bg-brand/15 text-brand-soft'
                }`}
              >
                {done ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Icon className="h-5 w-5" strokeWidth={1.75} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-base font-medium ${done ? 'text-slate-400 line-through decoration-slate-600' : 'text-white'}`}>
                  <span className="sr-only">Step {i + 1}: </span>
                  {title}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-slate-400">{description}</p>
                {!done && (
                  <button type="button" onClick={onClick} className="btn btn-secondary mt-3 sm:hidden">
                    {cta}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!done && (
                <button type="button" onClick={onClick} className="btn btn-secondary hidden shrink-0 sm:inline-flex">
                  {cta}
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="accounts-heading" className="card">
          <SectionHeader id="accounts-heading" title="Accounts" to="/accounts" />
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Your bank, card and investment accounts will appear here with their balances."
          />
        </section>

        <section aria-labelledby="activity-heading" className="card">
          <SectionHeader id="activity-heading" title="Recent activity" to="/transactions" />
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions yet"
            description="Once accounts are added, your latest income and spending shows up here."
          />
        </section>
      </div>
    </>
  )
}

function SectionHeader({ id, title, to }: { id: string; title: string; to: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5 sm:px-6">
      <h2 id={id} className="text-xl font-semibold text-white">
        {title}
      </h2>
      <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-soft hover:text-white pointer-fine:min-h-0">
        View all <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
