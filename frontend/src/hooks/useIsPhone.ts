import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767px)'

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True below the md breakpoint, where the phone layouts (tab bar, quick add) are used. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
