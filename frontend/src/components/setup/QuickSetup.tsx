import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Clock, Globe2, Lock, Tags, Wallet } from 'lucide-react'
import { Dialog } from '../Dialog'
import { LogoMark } from '../Logo'
import { ErrorNote } from '../FirstLoginOnboarding'
import { useProfile } from '../../hooks/useProfile'
import type { UserSchemaDefinition } from '../../types'
import { ACCOUNT_TYPES, COUNTRIES, DEFAULT_CATEGORIES, STARTER_CATEGORIES, countryLabel } from './options'
import { ChipGroup, ChoiceList, CustomEntries, FieldLabel, StepIntro } from './fields'

interface QuickSetupProps {
  onComplete: () => void
  onSkip?: () => void
  /** Open the detailed setup after finishing */
  onAddDetail?: () => void
}

const STEPS = 3
const TOPICS = [
  { icon: Globe2, label: 'Where you live and pay tax' },
  { icon: Wallet, label: 'The kinds of accounts you have' },
  { icon: Tags, label: 'How you group your spending' },
]

/** Guided first-time setup — no AI. Saves the required part of the financial profile. */
export function QuickSetup({ onComplete, onSkip, onAddDetail }: QuickSetupProps) {
  const { load, save, saving, error } = useProfile()
  const [step, setStep] = useState(0) // 0 intro · 1..3 questions · 4 done
  const [existing, setExisting] = useState<UserSchemaDefinition | null>(null)
  const [countries, setCountries] = useState<string[]>(['DE'])
  const [taxCountry, setTaxCountry] = useState('DE')
  const [accounts, setAccounts] = useState<string[]>(['bank'])
  const [categories, setCategories] = useState<string[]>(STARTER_CATEGORIES)
  const [customCategories, setCustomCategories] = useState<string[]>([])

  // Pre-fill when the user already has a profile (re-running the quick setup)
  useEffect(() => {
    let cancelled = false
    load().then((p) => {
      if (cancelled || !p) return
      setExisting(p)
      if (p.residenceCountries?.length) setCountries(p.residenceCountries)
      if (p.taxSettings?.country) setTaxCountry(p.taxSettings.country)
      if (p.accountTypes?.length) setAccounts(p.accountTypes)
      if (p.expenseCategories?.length) {
        setCategories(p.expenseCategories.filter((c) => DEFAULT_CATEGORIES.includes(c)))
        setCustomCategories(p.expenseCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c)))
      }
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Keep the tax country one of the selected countries
  useEffect(() => {
    if (countries.length && !countries.includes(taxCountry)) setTaxCountry(countries[0])
  }, [countries, taxCountry])

  const allCategories = [...categories, ...customCategories]
  const valid = [true, countries.length > 0, accounts.length > 0, allCategories.length > 0][step] ?? true

  const finish = async () => {
    const saved = await save(
      {
        residenceCountries: countries,
        accountTypes: accounts,
        expenseCategories: allCategories,
        taxSettings: { ...(existing?.taxSettings ?? {}), country: taxCountry },
      },
      { complete: true },
    )
    if (saved) setStep(4)
  }

  const next = () => (step === STEPS ? void finish() : setStep((s) => s + 1))
  const inQuestions = step >= 1 && step <= STEPS

  return (
    <Dialog
      onClose={() => (step === 4 ? onComplete() : (onSkip ?? onComplete)())}
      closeLabel={step === 4 ? 'Close' : 'Skip setup for now'}
      title={step === 0 ? 'Welcome' : step === 4 ? 'All set' : 'Set up your profile'}
      subtitle={inQuestions ? `Question ${step} of ${STEPS}` : undefined}
      leading={
        step > 1 && inQuestions ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="icon-btn shrink-0" aria-label="Previous question">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : undefined
      }
      toolbar={
        inQuestions ? (
          <div className="h-1 shrink-0 bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS} aria-valuenow={step - 1}>
            <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${(step / STEPS) * 100}%` }} />
          </div>
        ) : undefined
      }
      footer={
        step === 0 ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onSkip && (
              <button type="button" onClick={onSkip} className="btn btn-ghost">
                Skip for now
              </button>
            )}
            <button type="button" onClick={() => setStep(1)} className="btn btn-primary sm:min-w-40">
              Get started
            </button>
          </div>
        ) : step === 4 ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onAddDetail && (
              <button type="button" onClick={onAddDetail} className="btn btn-secondary">
                Add more detail
              </button>
            )}
            <button type="button" onClick={onComplete} className="btn btn-primary sm:min-w-40">
              Go to dashboard
            </button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {step > 1 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="btn btn-ghost hidden sm:inline-flex">
                Back
              </button>
            )}
            <button type="button" onClick={next} disabled={!valid || saving} className="btn btn-primary sm:min-w-40">
              {step === STEPS ? (saving ? 'Saving…' : 'Finish setup') : 'Continue'}
            </button>
          </div>
        )
      }
    >
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        {step === 0 && (
          <div className="flex min-h-full flex-col justify-center py-4">
            <LogoMark className="h-14 w-14" />
            <p className="eyebrow mt-6">Welcome to AaryaAI Finance</p>
            <h3 className="mt-2 text-[32px] leading-[1.1] font-semibold text-ink sm:text-[38px]">
              Let's set up your <span className="heading-gradient">finances</span>
            </h3>
            <p className="mt-2 max-w-md text-base leading-relaxed text-slate-400">
              Three quick questions so your dashboard, categories and goals fit how you actually manage money.
            </p>
            <ul className="mt-8 space-y-3">
              {TOPICS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-base text-slate-200">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> About 1 minute
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-4 w-4" /> You can change answers later
              </span>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <StepIntro title="Where do you live and manage money?" text="Pick every country where you have income, accounts or property." />
            <ChipGroup label="Countries" options={COUNTRIES} selected={countries} onChange={setCountries} />
            {countries.length > 1 && (
              <div className="mt-7">
                <FieldLabel hint="Where you are tax resident. You can add details later.">Where do you mainly pay tax?</FieldLabel>
                <ChoiceList
                  label="Tax country"
                  options={countries.map((c) => ({ value: c, label: countryLabel(c) }))}
                  value={taxCountry}
                  onChange={setTaxCountry}
                />
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <StepIntro title="Which kinds of accounts do you have?" text="Just the types — no account numbers or bank logins." />
            <ChipGroup label="Account types" options={ACCOUNT_TYPES} selected={accounts} onChange={setAccounts} />
          </>
        )}

        {step === 3 && (
          <>
            <StepIntro title="How do you group your spending?" text="We've picked common categories to start. Tap to add or remove." />
            <ChipGroup label="Spending categories" options={DEFAULT_CATEGORIES} selected={categories} onChange={setCategories} />
            <div className="mt-6">
              <FieldLabel>Add your own</FieldLabel>
              <CustomEntries values={customCategories} onChange={setCustomCategories} placeholder="e.g. Pets" addLabel="Add" />
            </div>
            {error && <ErrorNote message={error} />}
          </>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-success/15 text-brand-success">
              <Check className="h-8 w-8" strokeWidth={2.5} />
            </span>
            <h3 className="mt-6 text-[28px] font-semibold text-ink">Your profile is ready</h3>
            <p className="mt-2 max-w-sm text-base text-slate-400">
              {countries.map(countryLabel).join(', ')} · {accounts.length} account {accounts.length === 1 ? 'type' : 'types'} ·{' '}
              {allCategories.length} categories
            </p>
            <p className="mt-4 max-w-sm text-sm text-slate-500">
              Add your household, goals, investments and tax details any time from your account menu.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  )
}
