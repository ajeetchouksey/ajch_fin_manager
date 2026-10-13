import { useEffect, useMemo, useState } from 'react'
import { AI_ENABLED } from '../config'

export type SlashCommand = 'setup' | 'overview' | 'accounts' | 'transactions' | 'goals'

export const COMMANDS: Record<SlashCommand, string> = {
  setup: 'Open financial setup',
  overview: 'Go to Overview',
  accounts: 'Go to Accounts',
  transactions: 'Go to Transactions',
  goals: 'Go to Goals',
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** "/" opens the palette (desktop keyboards); Ctrl+K / ⌘K also works on Windows and macOS. */
export function useSlashCommands() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if ((e.key === '/' && !isTyping(e.target) && !document.querySelector('[role="dialog"]')) || cmdK) {
        e.preventDefault()
        setInput('')
        setIsOpen(true)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase().replace(/^\//, '')
    return (Object.keys(COMMANDS) as SlashCommand[]).filter(
      (cmd) => (AI_ENABLED || cmd !== 'setup') && (!q || cmd.includes(q) || COMMANDS[cmd].toLowerCase().includes(q)),
    )
  }, [input])

  return { isOpen, setIsOpen, input, setInput, suggestions }
}
