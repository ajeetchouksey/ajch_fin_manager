import { useState, type ReactNode } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import type { Option } from './options'

/** Step heading inside a setup dialog. */
export function StepIntro({ title, text }: { title: ReactNode; text?: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-2xl leading-tight font-semibold text-white sm:text-[28px]">{title}</h3>
      {text && <p className="mt-1.5 text-base leading-relaxed text-slate-400">{text}</p>}
    </div>
  )
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2.5">
      <p className="text-[15px] font-semibold text-slate-100">{children}</p>
      {hint && <p className="mt-0.5 text-sm text-slate-400">{hint}</p>}
    </div>
  )
}

/** Multi-select chips (44px tall on touch screens). */
export function ChipGroup({
  options,
  selected,
  onChange,
  label,
}: {
  options: Array<string | Option>
  selected: string[]
  onChange: (next: string[]) => void
  label: string
}) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const value = typeof o === 'string' ? o : o.value
        const text = typeof o === 'string' ? o : o.label
        const on = selected.includes(value)
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(value)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors pointer-fine:min-h-9 ${
              on
                ? 'border-brand-soft/70 bg-brand/25 text-white'
                : 'border-line-strong bg-transparent text-slate-300 hover:border-brand-soft/40 hover:text-white'
            }`}
          >
            {on && <Check className="h-4 w-4 text-brand-soft" strokeWidth={2.5} />}
            {text}
          </button>
        )
      })}
    </div>
  )
}

/** Single choice as large radio cards. */
export function ChoiceList({
  options,
  value,
  onChange,
  label,
}: {
  options: Option[]
  value: string | undefined
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-[15px] transition-colors ${
              on ? 'border-brand-soft/70 bg-brand/20 text-white' : 'border-line-strong text-slate-300 hover:border-brand-soft/40'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                on ? 'border-brand-soft' : 'border-slate-500'
              }`}
            >
              {on && <span className="h-2.5 w-2.5 rounded-full bg-brand-soft" />}
            </span>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Add your own entries (e.g. a custom category) shown as removable chips. */
export function CustomEntries({
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || v.length > 100 || values.some((x) => x.toLowerCase() === v.toLowerCase())) return
    onChange([...values, v])
    setDraft('')
  }
  return (
    <div>
      {values.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {values.map((v) => (
            <span key={v} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-brand-soft/50 bg-brand/20 pl-4 pr-1.5 text-[15px] text-white">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          maxLength={100}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-canvas/60 px-4 text-white placeholder:text-slate-500 focus:border-brand-soft/60 focus:outline-none"
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className="btn btn-secondary shrink-0">
          <Plus className="h-4 w-4" />
          {addLabel}
        </button>
      </div>
    </div>
  )
}

export interface Member {
  name: string
  relationship: string
}

/** Household member list with add/remove. */
export function MemberList({
  members,
  onChange,
  relationships,
}: {
  members: Member[]
  onChange: (next: Member[]) => void
  relationships: Option[]
}) {
  const [name, setName] = useState('')
  const [rel, setRel] = useState(relationships[0].value)
  const add = () => {
    const n = name.trim()
    if (!n) return
    onChange([...members, { name: n.slice(0, 60), relationship: rel }])
    setName('')
  }
  const relLabel = (v: string) => relationships.find((r) => r.value === v)?.label ?? v
  return (
    <div>
      {members.length > 0 ? (
        <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
          {members.map((m, i) => (
            <li key={`${m.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-white">{m.name}</p>
                <p className="text-sm text-slate-400">{relLabel(m.relationship)}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(members.filter((_, j) => j !== i))}
                aria-label={`Remove ${m.name}`}
                className="icon-btn"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-slate-400">
          Nobody added yet. Skip this if it's just you.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          maxLength={60}
          placeholder="First name"
          aria-label="First name"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-canvas/60 px-4 text-white placeholder:text-slate-500 focus:border-brand-soft/60 focus:outline-none"
        />
        <select
          value={rel}
          onChange={(e) => setRel(e.target.value)}
          aria-label="Relationship"
          className="min-h-11 rounded-xl border border-line-strong bg-canvas px-3 text-white focus:border-brand-soft/60 focus:outline-none"
        >
          {relationships.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={!name.trim()} className="btn btn-secondary">
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  )
}
