import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<unknown>
  loading?: boolean
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function ChatInput({
  onSendMessage,
  loading = false,
  placeholder = 'Type your answer…',
  disabled = false,
  autoFocus = false,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const busy = loading || disabled

  // Grow with content up to ~5 lines
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [input])

  // Focus on desktop only — on phones this would pop the keyboard unasked
  useEffect(() => {
    if (autoFocus && !isTouchDevice()) textareaRef.current?.focus()
  }, [autoFocus])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const result = await onSendMessage(text)
    if (result === null) setInput(text) // failed — restore the draft for a retry
    if (!isTouchDevice()) textareaRef.current?.focus()
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send()
  }

  // Desktop (Windows/macOS): Enter sends, Shift+Enter = new line.
  // Phones (iOS/Android): Return inserts a new line; use the send button.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-2xl border border-line-strong bg-canvas/60 p-1.5 pl-4 transition-colors focus-within:border-brand-soft/60"
    >
      <label htmlFor="chat-input" className="sr-only">
        Your message
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        enterKeyHint="send"
        autoComplete="off"
        className="max-h-[140px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-base leading-6 text-ink placeholder:text-slate-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!input.trim() || busy}
        aria-label="Send message"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-strong disabled:bg-slate-700/60 disabled:text-slate-400"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.25} />}
      </button>
    </form>
  )
}
