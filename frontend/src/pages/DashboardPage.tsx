import { ArrowRight, Check, Tags, Target, UserRound, Users, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { LedgerOverview } from '../components/overview/LedgerOverview'
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
  const { aiEnabled, hasProfile, completedSections, openQuickSetup, openDetailedSetup } = useSetup()
  const firstName = user?.name?.split(' ')[0]
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  type Step = { icon: LucideIcon; title: string; description: string; done?: boolean; cta: string; onClick: () => void }
  const steps: Step[] = aiEnabled
    ? [
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
          done: completedSections.includes('goals'),
          cta: 'Set goals',
          onClick: () => openDetailedSetup('goals'),
        },
        {
          icon: Tags,
          title: 'Choose spending categories',
          description: 'Decide how expenses are grouped so reports match the way you think about money.',
          done: completedSections.includes('categories'),
          cta: 'Choose',
          onClick: () => openDetailedSetup('categories'),
        },
      ]
    : [
        {
          icon: UserRound,
          title: 'Create your financial profile',
          description: 'Three quick questions: where you live, your account types and spending categories.',
          done: hasProfile === true,
          cta: 'Start',
          onClick: openQuickSetup,
        },
        {
          icon: Target,
          title: 'Set your goals',
          description: 'An emergency fund, a home, retirement — pick what you are working towards.',
          done: completedSections.includes('goals'),
          cta: 'Set goals',
          onClick: () => (hasProfile ? openDetailedSetup('goals') : openQuickSetup()),
        },
        {
          icon: Users,
          title: 'Add your household',
          description: 'Partner, children or others whose costs you share. Skip it if it is just you.',
          done: completedSections.includes('household'),
          cta: 'Add',
          onClick: () => (hasProfile ? openDetailedSetup('household') : openQuickSetup()),
        },
      ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <>
      <PageHeader eyebrow={today} title={firstName ? <>{greeting()}, <span className="heading-gradient">{firstName}</span></> : greeting()} description={doneCount === steps.length ? 'Here is where your money went.' : "Let's get your finances organised."} />

      {/* Getting started */}
      {doneCount < steps.length && (
      <section aria-labelledby="getting-started" className="card card-accent-top overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id="getting-started" className="text-xl font-semibold text-ink">
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
                <p className={`text-base font-medium ${done ? 'text-slate-400 line-through decoration-slate-600' : 'text-ink'}`}>
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
      )}

      <div className={doneCount < steps.length ? 'mt-6' : ''}>
        <LedgerOverview />
      </div>
    </>
  )
}
