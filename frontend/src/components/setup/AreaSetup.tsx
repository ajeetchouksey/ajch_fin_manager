import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileText, Tags, Target, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import { Dialog } from '../Dialog'
import { ErrorNote } from '../FirstLoginOnboarding'
import type { FocusArea } from '../ProgressiveOnboardingModal'
import { useProfile, type ProfileUpdate } from '../../hooks/useProfile'
import type { UserSchemaDefinition } from '../../types'
import {
  COUNTRIES,
  DEFAULT_CATEGORIES,
  FILING_STATUS,
  GOALS,
  INVESTMENT_TYPES,
  RELATIONSHIPS,
  countryLabel,
} from './options'
import { ChipGroup, ChoiceList, CustomEntries, FieldLabel, MemberList, StepIntro, type Member } from './fields'

interface AreaSetupProps {
  onClose: () => void
  initialFocus?: FocusArea
  /** No profile yet: send the user to the quick setup first */
  onNeedQuickSetup: () => void
}

const AREAS: Array<{ id: FocusArea; label: string; description: string; icon: LucideIcon }> = [
  { id: 'household', label: 'Household', description: 'Partner, children, dependants, and your name on bank statements', icon: Users },
  { id: 'goals', label: 'Goals', description: 'What you are saving for', icon: Target },
  { id: 'investments', label: 'Investments', description: 'What kinds of investments you hold', icon: TrendingUp },
  { id: 'tax', label: 'Tax', description: 'Tax country and assessment type', icon: FileText },
  { id: 'categories', label: 'Spending categories', description: 'How your expenses are grouped', icon: Tags },
]

function summary(area: FocusArea, p: UserSchemaDefinition | null): string | null {
  if (!p) return null
  switch (area) {
    case 'household':
      return p.householdMembers?.length || p.ownNames?.length
        ? [p.householdMembers?.length ? `${p.householdMembers.length} added` : '', p.ownNames?.length ? 'your name set' : ''].filter(Boolean).join(' · ')
        : null
    case 'goals':
      return p.declaredGoals?.length ? `${p.declaredGoals.length} ${p.declaredGoals.length === 1 ? 'goal' : 'goals'}` : null
    case 'investments':
      return p.investmentPreferences
        ? p.investmentPreferences.hasInvestments
          ? `${p.investmentPreferences.types?.length ?? 0} types`
          : 'None yet'
        : null
    case 'tax':
      return p.taxSettings?.country ? countryLabel(p.taxSettings.country) : null
    case 'categories':
      return p.expenseCategories?.length ? `${p.expenseCategories.length} categories` : null
  }
}

/** Detailed setup by area — no AI. Each area saves only its own fields. */
export function AreaSetup({ onClose, initialFocus, onNeedQuickSetup }: AreaSetupProps) {
  const { load, save, saving, error, setError } = useProfile()
  const [profile, setProfile] = useState<UserSchemaDefinition | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [focus, setFocus] = useState<FocusArea | null>(initialFocus ?? null)
  const [justSaved, setJustSaved] = useState<FocusArea | null>(null)

  useEffect(() => {
    let cancelled = false
    load().then((p) => {
      if (cancelled) return
      setProfile(p)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const area = AREAS.find((a) => a.id === focus)

  const handleSave = useCallback(
    async (fields: ProfileUpdate) => {
      const saved = await save(fields)
      if (saved && focus) {
        setProfile(saved)
        setJustSaved(focus)
        setFocus(null)
      }
    },
    [save, focus],
  )

  const back = () => {
    setError(null)
    setFocus(null)
  }

  return (
    <Dialog
      onClose={onClose}
      size="lg"
      fitContent={!area}
      title={area ? area.label : 'Financial setup'}
      subtitle={area ? area.description : 'Add detail to your profile, one area at a time'}
      leading={
        area ? (
          <button type="button" onClick={back} className="icon-btn shrink-0" aria-label="Back to all areas">
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : undefined
      }
    >
      {!loaded ? (
        <p className="p-8 text-center text-slate-400">Loading your profile…</p>
      ) : !profile ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <h3 className="text-2xl font-semibold text-white">Start with the quick setup</h3>
          <p className="mt-2 max-w-sm text-base text-slate-400">
            Three short questions create your profile. Then you can add household, goals and more here.
          </p>
          <button type="button" onClick={onNeedQuickSetup} className="btn btn-primary mt-6 min-w-44">
            Start quick setup
          </button>
        </div>
      ) : !area ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
          {AREAS.map(({ id, label, description, icon: Icon }) => {
            const s = summary(id, profile)
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setJustSaved(null)
                  setFocus(id)
                }}
                className="group flex min-h-[76px] items-center gap-4 rounded-2xl border border-line bg-surface-2/60 p-4 text-left transition-colors hover:border-brand-soft/40 hover:bg-surface-2"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-soft">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-white">{label}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-400">
                    {justSaved === id ? (
                      <span className="inline-flex items-center gap-1 text-brand-success">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} /> Saved
                      </span>
                    ) : (
                      s ?? description
                    )}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
              </button>
            )
          })}
        </div>
      ) : (
        <AreaForm key={area.id} area={area.id} profile={profile} saving={saving} error={error} onSave={handleSave} onCancel={back} />
      )}
    </Dialog>
  )
}

interface AreaFormProps {
  area: FocusArea
  profile: UserSchemaDefinition
  saving: boolean
  error: string | null
  onSave: (fields: ProfileUpdate) => void
  onCancel: () => void
}

function AreaForm({ area, profile, saving, error, onSave, onCancel }: AreaFormProps) {
  // Local draft state per area, initialised from the saved profile
  const [members, setMembers] = useState<Member[]>(profile.householdMembers ?? [])
  const [ownNames, setOwnNames] = useState<string[]>(profile.ownNames ?? [])
  const presetGoals = (profile.declaredGoals ?? []).filter((g) => GOALS.includes(g))
  const [goals, setGoals] = useState<string[]>(presetGoals)
  const [customGoals, setCustomGoals] = useState<string[]>((profile.declaredGoals ?? []).filter((g) => !GOALS.includes(g)))
  const [hasInvestments, setHasInvestments] = useState<string>(
    profile.investmentPreferences ? (profile.investmentPreferences.hasInvestments ? 'yes' : 'no') : '',
  )
  const [invTypes, setInvTypes] = useState<string[]>(profile.investmentPreferences?.types ?? [])
  const [taxCountry, setTaxCountry] = useState(profile.taxSettings?.country ?? profile.residenceCountries[0])
  const [filing, setFiling] = useState(profile.taxSettings?.fillingStatus ?? '')
  const [cats, setCats] = useState<string[]>(profile.expenseCategories.filter((c) => DEFAULT_CATEGORIES.includes(c)))
  const [customCats, setCustomCats] = useState<string[]>(profile.expenseCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c)))

  const build = (): { fields: ProfileUpdate; valid: boolean } => {
    switch (area) {
      case 'household':
        return { fields: { householdMembers: members, ownNames: ownNames.map((n) => n.trim()).filter(Boolean) }, valid: true }
      case 'goals':
        return { fields: { declaredGoals: [...goals, ...customGoals] }, valid: true }
      case 'investments':
        return {
          fields: {
            investmentPreferences: hasInvestments === 'yes' ? { hasInvestments: true, types: invTypes } : { hasInvestments: false, types: [] },
          },
          valid: hasInvestments !== '',
        }
      case 'tax':
        return {
          fields: { taxSettings: { country: taxCountry, ...(filing ? { fillingStatus: filing } : {}) } },
          valid: !!taxCountry,
        }
      case 'categories':
        return { fields: { expenseCategories: [...cats, ...customCats] }, valid: cats.length + customCats.length > 0 }
    }
  }
  const { fields, valid } = build()
  // Tax country choices: the user's countries first, then the rest
  const taxOptions = [
    ...profile.residenceCountries.map((c) => ({ value: c, label: countryLabel(c) })),
    ...COUNTRIES.filter((c) => !profile.residenceCountries.includes(c.value)),
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
        {area === 'household' && (
          <>
            <StepIntro title="Who's in your household?" text="People whose costs you share or support. First names are enough." />
            <MemberList members={members} onChange={setMembers} relationships={RELATIONSHIPS} />
            <div className="mt-8">
              <FieldLabel>Your name as your bank shows it</FieldLabel>
              <p className="mb-3 text-sm text-slate-400">
                Money sent to or from this name (for example to your own account at Wise) is counted as a transfer, not as spending.
              </p>
              <CustomEntries values={ownNames} onChange={setOwnNames} placeholder="e.g. ASHA K VERMA" addLabel="Add" />
            </div>
          </>
        )}
        {area === 'goals' && (
          <>
            <StepIntro title="What are you saving for?" text="Pick any that apply. Amounts and dates come later." />
            <ChipGroup label="Goals" options={GOALS} selected={goals} onChange={setGoals} />
            <div className="mt-6">
              <FieldLabel>Add your own</FieldLabel>
              <CustomEntries values={customGoals} onChange={setCustomGoals} placeholder="e.g. Wedding" addLabel="Add" />
            </div>
          </>
        )}
        {area === 'investments' && (
          <>
            <StepIntro title="Do you have investments?" text="Only the kinds you hold — no amounts or account details." />
            <ChoiceList
              label="Has investments"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'Not yet' },
              ]}
              value={hasInvestments}
              onChange={setHasInvestments}
            />
            {hasInvestments === 'yes' && (
              <div className="mt-7">
                <FieldLabel>Which kinds?</FieldLabel>
                <ChipGroup label="Investment types" options={INVESTMENT_TYPES} selected={invTypes} onChange={setInvTypes} />
              </div>
            )}
          </>
        )}
        {area === 'tax' && (
          <>
            <StepIntro title="Your tax setup" text="Used to show the right deadlines and allowances. This isn't tax advice." />
            <FieldLabel>Where are you tax resident?</FieldLabel>
            <ChoiceList label="Tax country" options={taxOptions.slice(0, 6)} value={taxCountry} onChange={setTaxCountry} />
            <div className="mt-7">
              <FieldLabel hint="Optional">How are you assessed?</FieldLabel>
              <ChoiceList label="Assessment" options={FILING_STATUS} value={filing} onChange={setFiling} />
            </div>
          </>
        )}
        {area === 'categories' && (
          <>
            <StepIntro title="Spending categories" text="Tap to add or remove. At least one is needed." />
            <ChipGroup label="Spending categories" options={DEFAULT_CATEGORIES} selected={cats} onChange={setCats} />
            <div className="mt-6">
              <FieldLabel>Your own categories</FieldLabel>
              <CustomEntries values={customCats} onChange={setCustomCats} placeholder="e.g. Pets" addLabel="Add" />
            </div>
          </>
        )}
        {error && <ErrorNote message={error} />}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:pb-4">
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={() => onSave(fields)} disabled={!valid || saving} className="btn btn-primary sm:min-w-36">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
