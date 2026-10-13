import { useSlashCommands, type SlashCommand } from '../hooks/useSlashCommands'

export type { SlashCommand }

interface SlashCommandPaletteProps {
  onCommandExecuted?: (command: SlashCommand) => void
  handlers?: Partial<Record<SlashCommand, () => void>>
}

export function SlashCommandPalette({
  onCommandExecuted,
  handlers = {},
}: SlashCommandPaletteProps) {
  const {
    isOpen,
    setIsOpen,
    input,
    setInput,
    suggestions,
    executeCommand,
    commands,
  } = useSlashCommands({
    ...handlers,
  })

  const handleSelectCommand = (command: SlashCommand) => {
    executeCommand(command)
    onCommandExecuted?.(command)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-slate-800 rounded-xl border border-slate-700/50 w-full max-w-md shadow-2xl max-h-96 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-4 border-b border-slate-700/30">
          <div className="flex items-center gap-2 bg-slate-700/30 rounded-lg px-3 py-2">
            <span className="text-slate-400">/</span>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type command name..."
              className="flex-1 bg-transparent text-white placeholder-slate-400 focus:outline-none text-sm"
            />
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex-1 overflow-y-auto">
          {suggestions.length > 0 ? (
            <div className="p-2">
              {suggestions.map((command) => (
                <button
                  key={command}
                  onClick={() => handleSelectCommand(command)}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-700/50 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-violet-400 transition-colors">
                        {command}
                      </p>
                      <p className="text-xs text-slate-400">
                        {commands[command]}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-slate-700/50 rounded text-slate-300">
                      Enter
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400">No commands found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/30 px-4 py-3 bg-slate-700/20">
          <p className="text-xs text-slate-500">
            Press <kbd className="px-2 py-1 bg-slate-700 rounded text-slate-300">ESC</kbd> to close
          </p>
        </div>
      </div>
    </div>
  )
}
