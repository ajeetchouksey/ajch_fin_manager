import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FirstLoginOnboarding } from '../components/FirstLoginOnboarding'
import { ProgressiveOnboardingModal, type FocusArea } from '../components/ProgressiveOnboardingModal'
import { useOnboarding } from '../hooks/useOnboarding'
import { AI_ENABLED } from '../config'

interface SetupContextValue {
  /** False while AI onboarding is on hold — hide every setup entry point */
  aiEnabled: boolean
  /** null while the status is loading or unavailable */
  hasProfile: boolean | null
  openQuickSetup: () => void
  openDetailedSetup: (focus?: FocusArea) => void
}

const SetupContext = createContext<SetupContextValue | null>(null)

type OpenDialog = { kind: 'quick' } | { kind: 'detailed'; focus?: FocusArea } | null

export function SetupProvider({ children }: { children: ReactNode }) {
  const { checkStatus } = useOnboarding()
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)
  const [open, setOpen] = useState<OpenDialog>(null)

  const refresh = useCallback(async () => {
    const status = await checkStatus()
    if (status) setHasProfile(status.hasSchema)
    return status
  }, [checkStatus])

  // First sign-in: offer the quick setup once per session
  useEffect(() => {
    if (!AI_ENABLED) return
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
      openQuickSetup: () => AI_ENABLED && setOpen({ kind: 'quick' }),
      openDetailedSetup: (focus) => AI_ENABLED && setOpen({ kind: 'detailed', focus }),
    }),
    [hasProfile],
  )

  return (
    <SetupContext.Provider value={value}>
      {children}
      {open?.kind === 'quick' && <FirstLoginOnboarding onComplete={completed} onSkip={dismissQuick} />}
      {open?.kind === 'detailed' && (
        <ProgressiveOnboardingModal initialFocus={open.focus} onClose={() => { close(); void refresh() }} />
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
