import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FirstLoginOnboarding } from '../components/FirstLoginOnboarding'
import { ProgressiveOnboardingModal, type FocusArea } from '../components/ProgressiveOnboardingModal'
import { useOnboarding } from '../hooks/useOnboarding'
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
  const { checkStatus } = useOnboarding()
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)
  const [completedSections, setCompletedSections] = useState<string[]>([])
  const [open, setOpen] = useState<OpenDialog>(null)

  const refresh = useCallback(async () => {
    const status = await checkStatus()
    if (status) {
      setHasProfile(status.hasSchema)
      setCompletedSections(status.completedSections ?? [])
    }
    return status
  }, [checkStatus])

  // First sign-in: offer the quick setup once per session
  useEffect(() => {
    let cancelled = false
    refresh().then((status) => {
      if (cancelled || !status || status.hasSchema) return
      try {
        if (sessionStorage.getItem('setup-dismissed')) return
      } catch {
        /* storage unavailable (private mode) — show anyway */
      }
      setOpen({ kind: 'quick' })
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

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
