import { useCallback, useSyncExternalStore } from 'react'
import type { PeriodMode } from '../lib/ledger/periods'

/**
 * The period the money screens use: calendar month (default) or salary cycle. Stored on this
 * device and shared by every component that calls this hook, so a change on one screen applies
 * to the others straight away.
 */
const KEY = 'aarya.periodMode'
const EVENT = 'aarya:periodMode'

function read(): PeriodMode {
  try {
    return localStorage.getItem(KEY) === 'salary' ? 'salary' : 'calendar'
  } catch {
    return 'calendar'
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function usePeriodMode(): [PeriodMode, (mode: PeriodMode) => void] {
  const mode = useSyncExternalStore(subscribe, read, () => 'calendar' as PeriodMode)
  const setMode = useCallback((next: PeriodMode) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [mode, setMode]
}
