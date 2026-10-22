import { useId, useRef, useState, type ReactNode } from 'react'
import { FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react'

export const inputClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-line-strong bg-canvas/60 px-4 text-[15px] text-ink placeholder:text-slate-500 focus:border-brand-soft/60 focus:outline-none disabled:opacity-60'
export const selectClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-line-strong bg-canvas px-3 text-[15px] text-ink focus:border-brand-soft/60 focus:outline-none'

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-200">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

/** Comma-separated tags with suggestions; shows chips for what is typed. */
export function TagInput({ value, onChange, suggestions = [], id }: { value: string; onChange: (v: string) => void; suggestions?: string[]; id?: string }) {
  const listId = useId()
  const current = value.split(',').map((t) => t.trim()).filter(Boolean)
  const unused = suggestions.filter((s) => !current.includes(s)).slice(0, 6)
  return (
    <div>
      <input id={id} list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. holiday 2026, tax-deductible" className={inputClass} maxLength={300} />
      <datalist id={listId}>
        {unused.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(current.length ? `${current.join(', ')}, ${s}` : s)}
              className="rounded-full border border-line-strong px-3 py-1 text-xs text-slate-300 hover:border-brand-soft/50 hover:text-ink"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand-soft">
          {t}
        </span>
      ))}
    </div>
  )
}

export const ACCEPTED_FILES = 'image/*,application/pdf,.heic,.heif,.csv,.xlsx,.xls,.doc,.docx,.txt'

/** File picker: tap to choose (on phones this offers the camera too), or drag files onto it. */
export function FilePicker({ files, onChange, multiple = true, label = 'Attach receipts or documents' }: { files: File[]; onChange: (f: File[]) => void; multiple?: boolean; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const add = (list: FileList | null) => {
    if (!list) return
    const next = multiple ? [...files, ...Array.from(list)] : Array.from(list).slice(0, 1)
    onChange(next.slice(0, 20))
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          add(e.dataTransfer.files)
        }}
        className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm transition-colors ${
          over ? 'border-brand-soft bg-brand/10 text-ink' : 'border-line-strong text-slate-300 hover:border-brand-soft/50 hover:text-ink'
        }`}
      >
        <Paperclip className="h-4 w-4" />
        {label}
        <span className="hidden text-slate-500 pointer-fine:inline">· or drop files here</span>
      </button>
      <input ref={inputRef} type="file" accept={ACCEPTED_FILES} multiple={multiple} className="hidden" onChange={(e) => {
        add(e.target.files)
        e.target.value = ''
      }} />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              {f.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-slate-400" /> : <FileText className="h-4 w-4 shrink-0 text-slate-400" />}
              <span className="min-w-0 flex-1 truncate text-slate-200">{f.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" aria-label={`Remove ${f.name}`} className="icon-btn h-8 w-8 shrink-0" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      {children}
    </p>
  )
}

/** One list for every category, grouped by money out / money in, so nothing looks missing. */
export function CategorySelect({
  id,
  value,
  onChange,
  expense,
  income,
  empty = 'Choose…',
  transfer = false,
  className = selectClass,
}: {
  id?: string
  value: string
  onChange: (category: string) => void
  expense: string[]
  income: string[]
  /** Label of the empty choice */
  empty?: string
  /** Offer "Transfer" (between own accounts) */
  transfer?: boolean
  className?: string
}) {
  const known = value === '' || expense.includes(value) || income.includes(value) || (transfer && value === 'Transfer')
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {!known && <option value={value}>{value}</option>}
      <optgroup label="Money out">
        {expense.map((c) => (
          <option key={`out-${c}`} value={c}>{c}</option>
        ))}
      </optgroup>
      <optgroup label="Money in">
        {income.map((c) => (
          <option key={`in-${c}`} value={c}>{c}</option>
        ))}
      </optgroup>
      {transfer && (
        <optgroup label="Between my accounts">
          <option value="Transfer">Transfer</option>
        </optgroup>
      )}
    </select>
  )
}
