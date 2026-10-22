/**
 * Light / dark theme (design decision D1). The choice is kept on this device. Dark stays the default for
 * everyone who has not picked one; "System" follows the device setting. index.html applies the saved
 * choice before the app loads, so the page never flashes the wrong theme.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'aarya.theme'
export const DEFAULT_CHOICE: ThemeChoice = 'dark'
const CANVAS: Record<Theme, string> = { dark: '#0e1a2d', light: '#f7f6fb' }

export function parseChoice(v: unknown): ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT_CHOICE
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): Theme {
  return choice === 'system' ? (systemPrefersDark ? 'dark' : 'light') : choice
}

export function readChoice(): ThemeChoice {
  try {
    return parseChoice(localStorage.getItem(THEME_KEY))
  } catch {
    return DEFAULT_CHOICE
  }
}

export function saveChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
}

/** Sets data-theme on <html> and the browser bar colour. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CANVAS[theme])
}
