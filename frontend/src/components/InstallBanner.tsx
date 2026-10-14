import { useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const DISMISS_KEY = 'aarya.installDismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Offers to install the app, when the browser allows it. Dismissing it keeps it hidden on this device. */
export function InstallBanner() {
  const { canInstall, install } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(readDismissed)
  if (!canInstall || dismissed) return null

  const hide = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* storage unavailable: it reappears next visit */
    }
    setDismissed(true)
  }

  return (
    <div role="region" aria-label="Install the app" className="mx-auto mt-4 flex w-full max-w-6xl items-center gap-3 rounded-2xl border border-line bg-surface/70 px-4 py-3 text-sm text-slate-200 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
      <Smartphone className="h-5 w-5 shrink-0 text-brand-soft" aria-hidden />
      <p className="min-w-0 flex-1">Install FinBuddy to open it from your home screen, like an app.</p>
      <button type="button" className="btn btn-primary min-h-9 px-3 py-1.5 text-sm" onClick={() => void install().then(hide)}>
        Install app
      </button>
      <button type="button" className="icon-btn" aria-label="Hide this" onClick={hide}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
