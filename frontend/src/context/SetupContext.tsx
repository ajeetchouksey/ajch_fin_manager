import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FirstLoginOnboarding } from '../components/FirstLoginOnboarding'
import { ProgressiveOnboardingModal, type FocusArea } from '../components/ProgressiveOnboardingModal'
import { useLedger } from './LedgerContext'
import { useAuth } from '../hooks/useAuth'
import { completedSections as sectionsOf } from '../lib/ledger/profile'
import { moveServerProfileToLedger } from '../lib/profileMigration'
import { AI_ENABLED } from '../config'
import { QuickSetup } from '../components/setup/QuickSetup'
import { AreaSetup } from '../components/setup/AreaSetup'

interface SetupContextValue {
  /** True when the AI chat onboarding is on; otherwise setup uses guided forms */
  aiEnabled: boolean
  /** null while the status is loading or unavailable */
  hasProfile: boolean | null
  /** Profile sections that have data, e.g. 'goals', 'household' */
  completedSections: string[]
  openQuickSetup: () => void
  openDetailedSetup: (focus?: FocusArea) => void
}

const SetupContext = createContext<SetupContextValue | null>(null)

type OpenDialog = { kind: 'quick' } | { kind: 'detailed'; focus?: FocusArea } | null

export function SetupProvider({ children }: { children: ReactNode }) {
  const { status, profile, saveProfile } = useLedger()
  const { user } = useAuth()
  const [open, setOpen] = useState<OpenDialog>(null)
  // The one-time move of an older profile from our server into the Ledger: 'idle' until Drive is connected
  const [migration, setMigration] = useState<'idle' | 'running' | 'done'>('idle')

  // The profile lives in the Ledger, so it is only known once Google Drive is connected
  const hasProfile = status === 'ready' ? !!profile : null
  const completedSections = useMemo(() => sectionsOf(profile), [profile])

  // Kept for the dialogs' callbacks; the profile state comes from the Ledger, so nothing needs fetching
  const refresh = useCallback(async () => undefined, [])

  // Once Drive is connected and the Ledger has no profile, move any profile still on our server into it.
  // The server copy is deleted only after the Ledger copy reads back the same.
  useEffect(() => {
    if (status !== 'ready' || migration !== 'idle' || !user?.accessToken) return
    if (profile) {
      setMigration('done')
      return
    }
    setMigration('running')
    moveServerProfileToLedger({
      apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8787',
      token: user.accessToken,
      saveToLedger: (p) => saveProfile(p),
    })
      .catch(() => 'kept' as const)
      .finally(() => setMigration('done'))
  }, [status, profile, migration, user, saveProfile])

  // Drive first, then setup: offer the quick setup once per session when the Ledger has no profile
  useEffect(() => {
    if (migration !== 'done' || hasProfile !== false) return
    try {
      if (sessionStorage.getItem('setup-dismissed')) return
    } catch {
      /* storage unavailable (private mode) — show anyway */
    }
    setOpen({ kind: 'quick' })
  }, [migration, hasProfile])

  const close = useCallback(() => setOpen(null), [])
  const dismissQuick = useCallback(() => {
    try {
      sessionStorage.setItem('setup-dismissed', '1')
    } catch {
      /* ignore */
    }
    setOpen(null)
  }, [])
  const completed = useCallback(() => {
    setOpen(null)
    void refresh()
  }, [refresh])

  const value = useMemo<SetupContextValue>(
    () => ({
      aiEnabled: AI_ENABLED,
      hasProfile,
      completedSections,
      openQuickSetup: () => setOpen({ kind: 'quick' }),
      openDetailedSetup: (focus) => setOpen({ kind: 'detailed', focus }),
    }),
    [hasProfile, completedSections],
  )

  return (
    <SetupContext.Provider value={value}>
      {children}
      {AI_ENABLED ? (
        <>
          {open?.kind === 'quick' && <FirstLoginOnboarding onComplete={completed} onSkip={dismissQuick} />}
          {open?.kind === 'detailed' && (
            <ProgressiveOnboardingModal initialFocus={open.focus} onClose={() => { close(); void refresh() }} />
          )}
        </>
      ) : (
        <>
          {/* AI on hold (ADR-001): guided forms, same dialogs, same profile */}
          {open?.kind === 'quick' && (
            <QuickSetup
              onComplete={completed}
              onSkip={dismissQuick}
              onAddDetail={() => { void refresh(); setOpen({ kind: 'detailed' }) }}
            />
          )}
          {open?.kind === 'detailed' && (
            <AreaSetup
              initialFocus={open.focus}
              onClose={() => { close(); void refresh() }}
              onNeedQuickSetup={() => setOpen({ kind: 'quick' })}
            />
          )}
        </>
      )}
    </SetupContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetup() {
  const ctx = useContext(SetupContext)
  if (!ctx) throw new Error('useSetup must be used inside <SetupProvider>')
  return ctx
}
