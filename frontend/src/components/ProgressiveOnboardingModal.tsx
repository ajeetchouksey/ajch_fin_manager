import { useState, useEffect } from 'react'
import { OnboardingChatMessage } from './OnboardingChatMessage'
import { ChatInput } from './ChatInput'
import { useOnboarding } from '../hooks/useOnboarding'

type FocusArea = 'investments' | 'household' | 'goals' | 'tax' | 'categories'

interface ProgressiveOnboardingModalProps {
  onClose: () => void
  initialFocus?: FocusArea
}

const FOCUS_AREAS: Array<{
  id: FocusArea
  label: string
  description: string
  icon: string
}> = [
  {
    id: 'investments',
    label: 'Investment Setup',
    description: 'Configure your investment accounts and preferences',
    icon: '📈',
  },
  {
    id: 'household',
    label: 'Household Members',
    description: 'Add family members and dependents',
    icon: '👨‍👩‍👧‍👦',
  },
  {
    id: 'goals',
    label: 'Financial Goals',
    description: 'Set and track your financial goals',
    icon: '🎯',
  },
  {
    id: 'tax',
    label: 'Tax Settings',
    description: 'Configure tax-related information',
    icon: '📋',
  },
  {
    id: 'categories',
    label: 'Expense Categories',
    description: 'Customize your expense tracking categories',
    icon: '🏷️',
  },
]

export function ProgressiveOnboardingModal({
  onClose,
  initialFocus,
}: ProgressiveOnboardingModalProps) {
  const [selectedFocus, setSelectedFocus] = useState<FocusArea | null>(
    initialFocus || null
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    messages,
    loading,
    error,
    currentSchema,
    sendMessage,
    submitSchema,
    getCurrentSchema,
  } = useOnboarding({
    type: 'progressive',
    focus: selectedFocus || undefined,
  })

  // Load current schema on mount
  useEffect(() => {
    getCurrentSchema()
  }, [getCurrentSchema])

  const handleFocusSelect = (focus: FocusArea) => {
    setSelectedFocus(focus)
  }

  const handleSubmit = async (message: string) => {
    await sendMessage(message)
  }

  const handleComplete = async () => {
    if (!currentSchema || isSubmitting) return

    try {
      setIsSubmitting(true)
      await submitSchema(currentSchema, true)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/30 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Enhanced Setup</h2>
            <p className="text-sm text-slate-400">
              {selectedFocus
                ? `Setting up: ${FOCUS_AREAS.find((f) => f.id === selectedFocus)?.label}`
                : 'Choose what to set up'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-300 transition-colors"
          >
            <svg
              className="w-6 h-6"
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
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Focus Area Menu */}
          <div
            className={`${
              selectedFocus ? 'hidden lg:flex' : 'flex'
            } flex-col w-full lg:w-64 border-r border-slate-700/30 overflow-y-auto`}
          >
            <div className="p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Focus Areas
              </h3>
              <div className="space-y-2">
                {FOCUS_AREAS.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => handleFocusSelect(area.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-all ${
                      selectedFocus === area.id
                        ? 'bg-gradient-to-r from-violet-600 to-violet-500 text-white'
                        : 'bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{area.icon}</span>
                      <div>
                        <p className="font-medium text-sm">{area.label}</p>
                        <p className="text-xs opacity-75 hidden sm:block">
                          {area.description}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Area */}
          {selectedFocus && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl mb-3">
                        {FOCUS_AREAS.find((f) => f.id === selectedFocus)?.icon}
                      </div>
                      <p className="text-slate-300 mb-2 font-medium">
                        {FOCUS_AREAS.find((f) => f.id === selectedFocus)?.label}
                      </p>
                      <p className="text-sm text-slate-400">
                        Let's help you set this up. Start by telling me a bit
                        about your situation.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <OnboardingChatMessage key={idx} message={msg} />
                  ))
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-sm text-red-400">{error}</p>
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
              <div className="px-6 py-4 border-t border-slate-700/30">
                {messages.length === 0 ? (
                  <button
                    onClick={() =>
                      handleSubmit(
                        `I'd like to set up ${FOCUS_AREAS.find((f) => f.id === selectedFocus)?.label.toLowerCase()}.`
                      )
                    }
                    disabled={loading}
                    className="w-full px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-500 hover:shadow-lg hover:shadow-violet-500/30 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start
                  </button>
                ) : (
                  <>
                    <ChatInput
                      onSendMessage={handleSubmit}
                      loading={loading}
                      placeholder="Continue describing your setup..."
                    />
                    <button
                      onClick={handleComplete}
                      disabled={isSubmitting}
                      className="w-full mt-4 px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-500 hover:shadow-lg hover:shadow-violet-500/30 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Saving...' : 'Save & Continue'}
                    </button>
                    <button
                      onClick={() => setSelectedFocus(null)}
                      className="w-full mt-2 px-4 py-2 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white font-medium rounded-lg transition-all"
                    >
                      Choose Another Area
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
