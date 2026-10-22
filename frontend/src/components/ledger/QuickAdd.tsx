import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Delete, Loader2, X } from 'lucide-react'
import { useLedger } from '../../context/LedgerContext'
import { readLastEntry, useLedgerOptions, writeLastEntry } from '../../hooks/useLedgerOptions'
import { suggestCategory, TRANSFER_CATEGORY } from '../../lib/ledger/categorize'
import { categoryColor, categoryTint } from '../../lib/ledger/categoryColors'
import { formatMoney, todayIso, type Direction } from '../../lib/ledger/types'
import { ErrorNote } from './ui'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const

/** What the full form needs to carry on from here. */
export interface QuickDraft {
  direction: Direction
  amount: string
  category: string
  description: string
}

/**
 * Quick add on phones (design: MobileAdd): money out or in, an amount typed on a keypad,
 * a category chip and the payee. Saved for today; "More details" opens the full form.
 */
export function QuickAdd({ onClose, onMore }: { onClose: () => void; onMore: (draft: QuickDraft) => void }) {
  const { addTransaction, transactions, busy, error } = useLedger()
  const opts = useLedgerOptions()
  const last = readLastEntry()
  const [direction, setDirection] = useState<Direction>('out')
  const [digits, setDigits] = useState('')
  const [category, setCategory] = useState('')
  const [picked, setPicked] = useState(false)
  const [payee, setPayee] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const cents = Number(digits || '0')
  const amount = cents / 100
  const currency = last.currency || opts.defaultCurrency
  const account = last.account

  // The six categories this user picks most for this direction
  const chips = useMemo(() => {
    const pool = direction === 'out' ? opts.expenseCategories : opts.incomeCategories
    const n = new Map<string, number>()
    for (const t of transactions) if (t.direction === direction && pool.includes(t.category)) n.set(t.category, (n.get(t.category) ?? 0) + 1)
    const used = [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c)
    const list = Array.from(new Set([...used, ...pool])).filter((c) => c !== TRANSFER_CATEGORY).slice(0, 6)
    return category && !list.includes(category) ? [...list.slice(0, 5), category] : list
  }, [direction, transactions, opts.expenseCategories, opts.incomeCategories, category])

  // Typing a payee suggests its usual category until one is picked
  useEffect(() => {
    if (picked || !payee.trim()) return
    const t = window.setTimeout(() => {
      const hit = suggestCategory(payee, direction, opts.learned, { ownNames: opts.ownNames, userRules: opts.userRules })
      if (hit && hit.category !== TRANSFER_CATEGORY) setCategory(hit.category)
    }, 250)
    return () => window.clearTimeout(t)
  }, [payee, direction, picked, opts.learned, opts.ownNames, opts.userRules])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const press = (k: (typeof KEYS)[number]) => {
    setLocalError(null)
    if (k === 'del') return setDigits((d) => d.slice(0, -1))
    setDigits((d) => (d + k).replace(/^0+/, '').slice(0, 9))
  }

  const pickDirection = (d: Direction) => {
    setDirection(d)
    if (!(d === 'out' ? opts.expenseCategories : opts.incomeCategories).includes(category)) {
      setCategory('')
      setPicked(false)
    }
  }

  const save = async () => {
    setLocalError(null)
    if (cents <= 0) return setLocalError('Type the amount on the keypad.')
    const cat = category || (direction === 'out' ? 'Other' : 'Other income')
    try {
      await addTransaction(
        {
          date: todayIso(),
          direction,
          amount,
          currency,
          account: account ?? '',
          category: cat,
          description: (payee.trim() || cat).slice(0, 200),
          notes: '',
          tags: [],
        },
        [],
      )
      writeLastEntry({ ...last, currency, ...(direction === 'in' ? { categoryIn: cat } : { categoryOut: cat }) })
      onClose()
    } catch {
      /* shown from context */
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="qa-title" className="fixed inset-0 z-[60] flex flex-col gap-4 overflow-y-auto bg-canvas px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
        <h1 id="qa-title" className="font-display text-[22px] font-bold text-ink">Quick add</h1>
        <button type="button" className="min-h-11 px-1 text-sm font-semibold text-accent" onClick={() => onMore({ direction, amount: cents ? amount.toFixed(2) : '', category, description: payee })}>
          More details
        </button>
      </header>

      <div className="seg grid grid-cols-2" role="group" aria-label="Direction">
        {(['out', 'in'] as const).map((d) => (
          <button key={d} type="button" aria-pressed={direction === d} onClick={() => pickDirection(d)}>{d === 'out' ? 'Money out' : 'Money in'}</button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 py-1">
        <span aria-live="polite" className={`font-display text-[52px] leading-none font-bold tabular-nums ${direction === 'in' ? 'text-good' : 'text-ink'}`}>
          {direction === 'out' ? '−' : '+'}
          {formatMoney(amount, currency)}
        </span>
        <span className="text-sm text-slate-400">Today{account ? ` · ${account}` : ''}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span id="qa-cat" className="text-[13px] font-semibold text-slate-300">Category</span>
        <div role="radiogroup" aria-labelledby="qa-cat" className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = c === category
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setCategory(on ? '' : c)
                  setPicked(!on)
                }}
                className="flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-left text-[13px] font-semibold text-ink"
                style={{ borderColor: on ? categoryColor(c) : 'var(--color-line)', background: on ? categoryTint(c, 20) : 'var(--color-surface)' }}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c) }} />
                {c}
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-300">
        Payee
        <input className="field" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Payee (e.g. RMV)" maxLength={200} enterKeyHint="done" />
      </label>

      <div className="grid grid-cols-3 gap-2" aria-label="Amount keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Delete digit' : k}
            className="flex min-h-[52px] items-center justify-center rounded-xl border border-line bg-surface font-display text-2xl font-semibold text-ink active:bg-tint"
          >
            {k === 'del' ? <Delete className="h-6 w-6" aria-hidden /> : k}
          </button>
        ))}
      </div>

      <ErrorNote>{localError || error}</ErrorNote>

      <button type="button" className="btn btn-primary min-h-[52px] w-full text-base" onClick={() => void save()} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>,
    document.body,
  )
}
