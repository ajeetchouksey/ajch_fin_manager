import { useCallback, useSyncExternalStore } from 'react'
import { amountsHidden, setAmountsHidden, subscribeAmountsHidden } from '../lib/ledger/privacy'

const KEY = 'aarya.hideAmounts'

// Restore the choice kept on this device before the first screen is drawn
try {
  setAmountsHidden(localStorage.getItem(KEY) === '1')
} catch {
  /* storage can be blocked; amounts are then shown */
}

/** Hide amounts: kept on this device. `hidden` changes re-render whoever reads it (the layout re-keys on it). */
export function useHideAmounts(): [boolean, (value: boolean) => void] {
  const hidden = useSyncExternalStore(subscribeAmountsHidden, amountsHidden)
  const set = useCallback((value: boolean) => {
    try {
      localStorage.setItem(KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
    setAmountsHidden(value)
  }, [])
  return [hidden, set]
}
