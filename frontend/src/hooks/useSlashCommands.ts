import { useEffect, useState, useCallback } from 'react'

export type SlashCommand = 'onboarding-help' | 'reset-setup' | 'settings'

interface CommandHandler {
  command: SlashCommand
  description: string
  handler: () => void
}

export function useSlashCommands(handlers: Partial<Record<SlashCommand, () => void>>) {
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<SlashCommand[]>([])

  const commands: Record<SlashCommand, string> = {
    'onboarding-help': 'Enhanced financial setup',
    'reset-setup': 'Reset onboarding and start over',
    'settings': 'App settings and preferences',
  }

  // Listen for slash key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on "/" when not in an input field
      if (
        e.key === '/' &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault()
        setIsOpen(true)
        setInput('')
      }

      // Close on Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setInput('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Update suggestions based on input
  useEffect(() => {
    if (!input) {
      setSuggestions(Object.keys(commands) as SlashCommand[])
    } else {
      const filtered = (Object.keys(commands) as SlashCommand[]).filter((cmd) =>
        cmd.includes(input.toLowerCase())
      )
      setSuggestions(filtered)
    }
  }, [input])

  const executeCommand = useCallback(
    (command: SlashCommand) => {
      if (handlers[command]) {
        handlers[command]!()
      }
      setIsOpen(false)
      setInput('')
    },
    [handlers]
  )

  return {
    isOpen,
    setIsOpen,
    input,
    setInput,
    suggestions,
    executeCommand,
    commands,
  }
}
