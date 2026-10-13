import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, Tags, Target, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import { Dialog } from './Dialog'
import { OnboardingChatMessage, TypingIndicator } from './OnboardingChatMessage'
import { ChatInput } from './ChatInput'
import { ErrorNote } from './FirstLoginOnboarding'
import { useOnboarding } from '../hooks/useOnboarding'

export type FocusArea = 'investments' | 'household' | 'goals' | 'tax' | 'categories'

interface ProgressiveOnboardingModalProps {
  onClose: () => void
  initialFocus?: FocusArea
}

const FOCUS_AREAS: Array<{ id: FocusArea; label: string; description: string; icon: LucideIcon }> = [
  { id: 'investments', label: 'Investments', description: 'Investment accounts, risk profile and preferences', icon: TrendingUp },
  { id: 'household', label: 'Household', description: 'Partner, children and other dependents', icon: Users },
  { id: 'goals', label: 'Goals', description: 'What you are saving for, and by when', icon: Target },
  { id: 'tax', label: 'Tax', description: 'Residency, filing status and allowances', icon: FileText },
  { id: 'categories', label: 'Spending categories', description: 'How your expenses should be grouped', icon: Tags },
]

export function ProgressiveOnboardingModal({ onClose, initialFocus }: ProgressiveOnboardingModalProps) {
  const [focus, setFocus] = useState<FocusArea | null>(initialFocus ?? null)
  const area = FOCUS_AREAS.find((f) => f.id === focus)

  return (
    <Dialog
      onClose={onClose}
      size="lg"
      fitContent={!area}
      title={area ? area.label : 'Financial setup'}
      subtitle={area ? area.description : 'Pick an area to set up or refine with Aarya'}
      leading={
        area ? (
          <button type="button" onClick={() => setFocus(null)} className="icon-btn shrink-0 lg:hidden" aria-label="Back to all areas">
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : undefined
      }
    >
      {!area ? (
        <AreaGrid onSelect={setFocus} />
      ) : (
        <div className="flex h-full">
          {/* Desktop/tablet-landscape: area list stays visible */}
          <nav aria-label="Setup areas" className="hidden w-60 shrink-0 overflow-y-auto border-r border-line p-3 lg:block">
            {FOCUS_AREAS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFocus(id)}
                aria-current={id === focus ? 'page' : undefined}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  id === focus ? 'bg-brand/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${id === focus ? 'text-brand-soft' : ''}`} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </nav>
          {/* key → each area gets its own conversation */}
          <FocusChat key={area.id} focus={area.id} label={area.label} icon={area.icon} onSaved={onClose} />
        </div>
      )}
    </Dialog>
  )
}

function AreaGrid({ onSelect }: { onSelect: (f: FocusArea) => void }) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
      {FOCUS_AREAS.map(({ id, label, description, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className="group flex min-h-[76px] items-center gap-4 rounded-2xl border border-line bg-surface-2/60 p-4 text-left transition-colors hover:border-brand-soft/40 hover:bg-surface-2"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-white">{label}</span>
            <span className="mt-0.5 block text-sm leading-snug text-slate-400">{description}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
        </button>
      ))}
    </div>
  )
}

interface FocusChatProps {
  focus: FocusArea
  label: string
  icon: LucideIcon
  onSaved: () => void
}

function FocusChat({ focus, label, icon: Icon, onSaved }: FocusChatProps) {
  const { messages, loading, error, currentSchema, sendMessage, submitSchema, getCurrentSchema } = useOnboarding({
    type: 'progressive',
    focus,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const started = messages.length > 0

  useEffect(() => {
    getCurrentSchema()
  }, [getCurrentSchema])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, loading])

  const handleSave = async () => {
    if (!currentSchema || isSubmitting) return
    setIsSubmitting(true)
    try {
      const result = await submitSchema(currentSchema, true)
      if (result) onSaved()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!started ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand-soft">
              <Icon className="h-7 w-7" strokeWidth={1.75} />
            </span>
            <h3 className="mt-5 text-lg font-semibold text-white">Set up {label.toLowerCase()}</h3>
            <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-slate-400">
              Aarya will ask a few questions and update your profile. Nothing is saved until you choose Save.
            </p>
            <button
              type="button"
              onClick={() => sendMessage(`I'd like to set up ${label.toLowerCase()}.`)}
              disabled={loading}
              className="btn btn-primary mt-6 min-w-40"
            >
              {loading ? 'Starting…' : 'Start'}
            </button>
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
      </div>

      {started && (
        <div className="shrink-0 space-y-2.5 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
          <ChatInput onSendMessage={sendMessage} loading={loading} placeholder="Type your answer…" autoFocus />
          <button
            type="button"
            onClick={handleSave}
            disabled={!currentSchema || isSubmitting || loading}
            className="btn btn-secondary w-full"
          >
            {isSubmitting ? 'Saving…' : `Save ${label.toLowerCase()}`}
          </button>
        </div>
      )}
    </div>
  )
}
