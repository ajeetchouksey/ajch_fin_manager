import { useState } from 'react'

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>
  loading?: boolean
  placeholder?: string
  disabled?: boolean
}

export function ChatInput({
  onSendMessage,
  loading = false,
  placeholder = 'Type your response...',
  disabled = false,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading || isSubmitting || disabled) return

    try {
      setIsSubmitting(true)
      await onSendMessage(input.trim())
      setInput('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-3 items-end"
    >
      <div className="flex-1 relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading || disabled}
          rows={1}
          className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 resize-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            maxHeight: '120px',
            minHeight: '44px',
          }}
        />
      </div>

      <button
        type="submit"
        disabled={!input.trim() || loading || isSubmitting || disabled}
        className="flex-shrink-0 p-3 bg-gradient-to-r from-violet-600 to-violet-500 hover:shadow-lg hover:shadow-violet-500/30 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {isSubmitting || loading ? (
          <svg
            className="w-5 h-5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              opacity="0.2"
            />
            <path
              fill="currentColor"
              d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0-2a10 10 0 110 20 10 10 0 010-20z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        )}
      </button>
    </form>
  )
}
