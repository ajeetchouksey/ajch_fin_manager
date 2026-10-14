import { useEffect, useState } from 'react'

/**
 * The browser's "install this app" offer. Chrome, Edge and Android offer it through an event that
 * can be used once; it is captured when the app loads, so it is still there when the page draws.
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

const isInstalled = () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [, redraw] = useState(0)
  useEffect(() => {
    const l = () => redraw((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    canInstall: !!deferred && !isInstalled(),
    install: async () => {
      const event = deferred
      if (!event) return
      await event.prompt()
      await event.userChoice
      deferred = null
      notify()
    },
  }
}
