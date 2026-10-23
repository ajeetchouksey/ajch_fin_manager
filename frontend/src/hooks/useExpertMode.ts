import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'aarya.expertMode'

let on = false
// Restore the choice kept on this device before the first screen is drawn
try {
  on = localStorage.getItem(KEY) === '1'
} catch {
  /* storage can be blocked; expert mode is then off */
}
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Expert mode: off until the user turns it on, never on its own. Kept on this device. */
export function useExpertMode(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => on)
  const set = useCallback((next: boolean) => {
    on = next
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn())
  }, [])
  return [value, set]
}
