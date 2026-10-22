import { useEffect, useSyncExternalStore } from 'react'
import { applyTheme, readChoice, resolveTheme, saveChoice, type Theme, type ThemeChoice } from '../lib/theme'

// One shared store, so the switch in the menu and the app-wide listener always agree.
let choice: ThemeChoice = readChoice()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

function subscribe(l: () => void) {
  listeners.add(l)
  const m = mq()
  m?.addEventListener('change', l)
  return () => {
    listeners.delete(l)
    m?.removeEventListener('change', l)
  }
}

const snapshot = () => `${choice}|${mq()?.matches ?? true}`

export function setThemeChoice(c: ThemeChoice) {
  choice = c
  saveChoice(c)
  emit()
}

/** The theme choice (System / Light / Dark) and the theme in effect. Applies it to <html>. */
export function useTheme(): { choice: ThemeChoice; theme: Theme; setChoice: (c: ThemeChoice) => void } {
  const snap = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [c, dark] = snap.split('|') as [ThemeChoice, string]
  const theme = resolveTheme(c, dark === 'true')
  useEffect(() => applyTheme(theme), [theme])
  return { choice: c, theme, setChoice: setThemeChoice }
}
