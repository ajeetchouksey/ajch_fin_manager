import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSetup } from '../context/SetupContext'

export function UserMenu() {
  const { user, logout } = useAuth()
  const { hasProfile, openQuickSetup, openDetailedSetup } = useSetup()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const initial = (user.name || user.email || 'U').charAt(0).toUpperCase()
  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-11 w-11 items-center justify-center rounded-full pointer-fine:h-9 pointer-fine:w-9"
      >
        {user.picture && !imgFailed ? (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-9 w-9 rounded-full ring-1 ring-line-strong"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/25 text-sm font-semibold text-white ring-1 ring-brand-soft/40">
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line-strong bg-surface p-1.5 shadow-2xl shadow-black/60 animate-dialog-in"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          {hasProfile === false && (
            <MenuItem icon={Sparkles} label="Complete quick setup" onClick={run(openQuickSetup)} />
          )}
          <MenuItem icon={SlidersHorizontal} label="Financial setup" onClick={run(() => openDetailedSetup())} />
          <div className="my-1 h-px bg-line" />
          <MenuItem
            icon={LogOut}
            label="Sign out"
            onClick={run(() => {
              logout()
              navigate('/login')
            })}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof LogOut; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/6 hover:text-white pointer-fine:min-h-9"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      {label}
    </button>
  )
}
