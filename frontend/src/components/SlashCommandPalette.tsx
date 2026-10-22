import { useEffect, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, CornerDownLeft, LayoutDashboard, Search, SlidersHorizontal, Target, Wallet } from 'lucide-react'
import { COMMANDS, useSlashCommands, type SlashCommand } from '../hooks/useSlashCommands'
import { useSetup } from '../context/SetupContext'

export type { SlashCommand }

const ICONS: Record<SlashCommand, typeof Search> = {
  setup: SlidersHorizontal,
  overview: LayoutDashboard,
  accounts: Wallet,
  transactions: ArrowLeftRight,
  goals: Target,
}

export function SlashCommandPalette() {
  const { isOpen, setIsOpen, input, setInput, suggestions } = useSlashCommands()
  const { openDetailedSetup } = useSetup()
  const navigate = useNavigate()
  const [active, setActive] = useState(0)

  useEffect(() => setActive(0), [input, isOpen])

  if (!isOpen) return null

  const execute = (cmd: SlashCommand) => {
    setIsOpen(false)
    if (cmd === 'setup') openDetailedSetup()
    else navigate(cmd === 'overview' ? '/dashboard' : `/${cmd}`)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && suggestions[active]) {
      e.preventDefault()
      execute(suggestions[active])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 px-4 pt-[15vh] backdrop-blur-sm" onClick={() => setIsOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        className="card w-full max-w-lg overflow-hidden shadow-2xl shadow-black/60 animate-dialog-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search actions…"
            aria-label="Search actions"
            className="h-12 flex-1 bg-transparent text-ink placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-slate-500">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {suggestions.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matching actions</li>}
          {suggestions.map((cmd, i) => {
            const Icon = ICONS[cmd]
            return (
              <li key={cmd} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => execute(cmd)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    i === active ? 'bg-brand/15 text-ink' : 'text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4 text-slate-400" />
                  <span className="flex-1">{COMMANDS[cmd]}</span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-slate-500" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
