import { useEffect, useState } from 'react'
import { OnboardingChatMessage } from './OnboardingChatMessage'
import { ChatInput } from './ChatInput'
import { useOnboarding } from '../hooks/useOnboarding'

interface FirstLoginOnboardingProps {
  onComplete: () => void
  onSkip?: () => void
}

export function FirstLoginOnboarding({
  onComplete,
  onSkip,
}: FirstLoginOnboardingProps) {
  const {
    messages,
    loading,
    error,
    currentSchema,
    sendMessage,
    submitSchema,
  } = useOnboarding({ type: 'initial' })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasShownInitialMessage, setHasShownInitialMessage] = useState(false)

  // Show initial AI message on mount
  useEffect(() => {
    if (!hasShownInitialMessage && !loading && messages.length === 0) {
      setHasShownInitialMessage(true)
      // This would normally come from AI, but we can use sendMessage to continue
    }
  }, [hasShownInitialMessage, loading, messages.length])

  const handleSubmit = async (message: string) => {
    await sendMessage(message)
  }

  const handleComplete = async () => {
    if (!currentSchema || isSubmitting) return

    try {
      setIsSubmitting(true)
      await submitSchema(currentSchema, false)
      onComplete()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-700/50 w-full h-[90vh] sm:h-auto sm:max-w-lg md:max-w-2xl sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-700/30 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">Quick Setup</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Let's set up your profile ({messages.length > 0 ? Math.ceil((messages.length / 6) * 100) : 0}%)
            </p>
          </div>
          {onSkip && (
            <button
              onClick={onSkip}
              className="ml-3 flex-shrink-0 text-slate-400 hover:text-slate-300 transition-colors"
              aria-label="Close setup"
            >
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[300px] sm:min-h-[400px]">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center text-white text-lg font-bold mx-auto mb-3">
                  AI
                </div>
                <p className="text-slate-300 mb-2 text-sm sm:text-base">
                  Welcome to Finance Manager!
                </p>
                <p className="text-xs sm:text-sm text-slate-400">
                  I'm here to help you set up your financial profile in just a few minutes.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <OnboardingChatMessage key={idx} message={msg} />
            ))
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {loading && (
            <div className="flex gap-2 items-center justify-center py-4">
              <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" />
              <div
                className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
              <div
                className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-700/30 flex-shrink-0">
          {messages.length > 0 && !loading ? (
            <>
              <ChatInput
                onSendMessage={handleSubmit}
                loading={loading}
                placeholder="Type your response..."
              />
              {messages.length >= 6 && (
                <button
                  onClick={handleComplete}
                  disabled={isSubmitting}
                  className="w-full mt-3 sm:mt-4 px-4 py-2 sm:py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 hover:shadow-lg hover:shadow-violet-500/30 text-white text-sm sm:text-base font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Complete Setup'}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() =>
                handleSubmit(
                  'Let me start with my basic financial information.'
                )
              }
              disabled={loading}
              className="w-full px-4 py-2 sm:py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 hover:shadow-lg hover:shadow-violet-500/30 text-white text-sm sm:text-base font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Setup
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
