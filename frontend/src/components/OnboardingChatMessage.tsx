import type { OnboardingMessage } from '../types'

interface OnboardingChatMessageProps {
  message: OnboardingMessage
  showAvatar?: boolean
}

export function OnboardingChatMessage({
  message,
  showAvatar = true,
}: OnboardingChatMessageProps) {
  const isAssistant = message.role === 'assistant'

  return (
    <div
      className={`flex gap-3 animate-fadeIn ${
        isAssistant ? 'justify-start' : 'justify-end'
      }`}
    >
      {isAssistant && showAvatar && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center text-white text-sm font-bold">
          AI
        </div>
      )}

      <div
        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
          isAssistant
            ? 'bg-slate-700/50 text-slate-100 border border-slate-600/30'
            : 'bg-gradient-to-r from-violet-600 to-violet-500 text-white'
        }`}
      >
        <p className="text-sm leading-relaxed break-words">{message.content}</p>
      </div>
    </div>
  )
}
