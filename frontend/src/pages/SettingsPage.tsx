import { Link } from 'react-router-dom'
import { ChevronRight, HardDrive, SlidersHorizontal, Users } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ThemeSwitch } from '../components/UserMenu'
import { useSetup } from '../context/SetupContext'

/** Settings: appearance, financial profile and storage in one place (sidebar item, D2). */
export function SettingsPage() {
  const { openDetailedSetup } = useSetup()
  const row = 'flex min-h-14 w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-brand-soft/50'

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="card p-2" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="px-3 pt-3 text-lg font-semibold text-ink">Appearance</h2>
          <p className="px-3 text-sm text-slate-400">Kept on this device. System follows your device setting.</p>
          <ThemeSwitch showLabel={false} />
        </section>

        <section className="card space-y-2 p-5" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-lg font-semibold text-ink">Your profile</h2>
          <button type="button" className={row} onClick={() => openDetailedSetup()}>
            <SlidersHorizontal className="h-5 w-5 shrink-0 text-brand-soft" aria-hidden />
            <span className="flex-1">
              <span className="block font-medium text-ink">Financial setup</span>
              <span className="block text-sm text-slate-400">Countries, categories, goals, investments, tax</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
          </button>
          <button type="button" className={row} onClick={() => openDetailedSetup('household')}>
            <Users className="h-5 w-5 shrink-0 text-brand-soft" aria-hidden />
            <span className="flex-1">
              <span className="block font-medium text-ink">Household and your bank name</span>
              <span className="block text-sm text-slate-400">Payments to or from your own name count as transfers</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
          </button>
          <Link to="/settings/storage" className={row}>
            <HardDrive className="h-5 w-5 shrink-0 text-brand-soft" aria-hidden />
            <span className="flex-1">
              <span className="block font-medium text-ink">Storage</span>
              <span className="block text-sm text-slate-400">Your Ledger in Google Drive</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
          </Link>
        </section>
      </div>
    </>
  )
}
