import { useEffect, useRef, useState } from 'react'
import { Clock, Lock, Sparkles, Users, Wallet, Target } from 'lucide-react'
import { Dialog } from './Dialog'
import { LogoMark } from './Logo'
import { OnboardingChatMessage, TypingIndicator } from './OnboardingChatMessage'
import { ChatInput } from './ChatInput'
import { useOnboarding } from '../hooks/useOnboarding'

interface FirstLoginOnboardingProps {
  onComplete: () => void
  onSkip?: () => void
}

/** Answers after which the profile is usually complete enough to save. */
const EXPECTED_TURNS = 3

const TOPICS = [
  { icon: Users, label: 'Your household' },
  { icon: Wallet, label: 'Income & spending' },
  { icon: Target, label: 'What you are saving for' },
]

export function FirstLoginOnboarding({ onComplete, onSkip }: FirstLoginOnboardingProps) {
  const { messages, loading, error, currentSchema, sendMessage, submitSchema } = useOnboarding({
    type: 'initial',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const started = messages.length > 0
  // The first user message is the "Get started" greeting, not an answer
  const answered = Math.max(messages.filter((m) => m.role === 'user').length - 1, 0)
  const progress = Math.min(answered / EXPECTED_TURNS, 1)
  const canFinish = answered >= EXPECTED_TURNS && !!currentSchema

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, loading])

  const handleClose = () => (onSkip ?? onComplete)()

  const handleComplete = async () => {
    if (!currentSchema || isSubmitting) return
    setIsSubmitting(true)
    try {
      const result = await submitSchema(currentSchema, false)
      if (result) onComplete()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      onClose={handleClose}
      closeLabel="Skip setup for now"
      title={started ? 'Set up your profile' : 'Welcome'}
      subtitle={started ? canFinish ? 'Ready to save' : `Question ${Math.min(answered + 1, EXPECTED_TURNS)} of ${EXPECTED_TURNS}` : undefined}
      toolbar={
        started ? (
          <div className="h-1 shrink-0 bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${Math.max(progress, 0.08) * 100}%` }} />
          </div>
        ) : undefined
      }
      footer={
        started ? (
          <div className="space-y-2.5">
            <ChatInput onSendMessage={sendMessage} loading={loading} autoFocus />
            {canFinish && (
              <button type="button" onClick={handleComplete} disabled={isSubmitting || loading} className="btn btn-primary w-full">
                {isSubmitting ? 'Saving…' : 'Finish setup'}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onSkip && (
              <button type="button" onClick={onSkip} className="btn btn-ghost">
                Skip for now
              </button>
            )}
            <button
              type="button"
              onClick={() => sendMessage("Hi! I'd like to set up my financial profile.")}
              disabled={loading}
              className="btn btn-primary sm:min-w-40"
            >
              <Sparkles className="h-4 w-4" />
              Get started
            </button>
          </div>
        )
      }
    >
      {!started ? (
        <div className="flex min-h-full flex-col justify-center px-6 py-10 sm:px-10">
          <LogoMark className="h-14 w-14" />
          <h3 className="mt-6 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
            Let's set up your finances
          </h3>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-400">
            Aarya will ask a few short questions so your dashboard, categories and goals fit how you actually
            manage money.
          </p>

          <ul className="mt-8 space-y-3">
            {TOPICS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-[15px] text-slate-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                {label}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> About 3 minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4" /> You can change answers later
            </span>
          </div>

          {loading && <p className="mt-6 text-sm text-slate-400">Starting…</p>}
          {error && <ErrorNote message={error} />}
        </div>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 sm:px-6">
          {messages.map((msg, idx) => (
            <OnboardingChatMessage key={idx} message={msg} />
          ))}
          {loading && <TypingIndicator />}
          {error && <ErrorNote message={error} />}
          <div ref={endRef} />
        </div>
      )}
    </Dialog>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
      Something went wrong: {message}. Please try again.
    </div>
  )
}
