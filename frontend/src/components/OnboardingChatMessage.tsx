import type { OnboardingMessage } from '../types'
import { LogoMark } from './Logo'

interface OnboardingChatMessageProps {
  message: OnboardingMessage
}

export function OnboardingChatMessage({ message }: OnboardingChatMessageProps) {
  const isAssistant = message.role === 'assistant'

  if (isAssistant) {
    return (
      <div className="flex items-start gap-2.5 animate-fade-in">
        <LogoMark className="mt-0.5 h-7 w-7 shrink-0" />
        <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed text-slate-100 sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end animate-fade-in">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand px-4 py-2.5 text-[15px] leading-relaxed text-white sm:max-w-[75%]">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5" aria-live="polite" aria-label="Aarya is typing">
      <LogoMark className="mt-0.5 h-7 w-7 shrink-0" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-surface-2 px-4 py-3.5">
        <span className="typing-dot" />
        <span className="typing-dot [animation-delay:0.15s]" />
        <span className="typing-dot [animation-delay:0.3s]" />
      </div>
    </div>
  )
}
