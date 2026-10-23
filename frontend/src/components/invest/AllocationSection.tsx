import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNote, inputClass } from '../ledger/ui'
import { useLedger } from '../../context/LedgerContext'
import { useProfile } from '../../hooks/useProfile'
import { ASSET_CLASSES, allocationFor, cleanTarget, driftNotes, putInVersusWorth, targetProblem, type AllocationTarget, type AssetClassId } from '../../lib/ledger/allocation'
import { cleanInvestorProfile } from '../../lib/ledger/investor'
import { formatMoney, todayIso } from '../../lib/ledger/types'

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
const signed = (v: number, currency: string) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${formatMoney(Math.abs(v), currency)}`

/** Put in versus worth for each investment account, and how the money is spread across kinds of holding against a target. */
export function AllocationSection() {
  const { accounts, balances, transactions, holdings, profile } = useLedger()
  const { save, saving, error, setError } = useProfile()
  const stored = useMemo(() => cleanInvestorProfile(profile?.investorProfile), [profile])
  const today = todayIso()

  const rows = useMemo(() => putInVersusWorth(accounts, balances, transactions, today), [accounts, balances, transactions, today])
  const currencies = useMemo(() => [...new Set(rows.map((r) => r.currency))], [rows])
  const allocations = useMemo(
    () => currencies.map((c) => allocationFor(accounts, balances, transactions, c, today, stored.allocationTarget, holdings)),
    [currencies, accounts, balances, transactions, today, stored.allocationTarget, holdings],
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    setDraft(Object.fromEntries(ASSET_CLASSES.map((c) => [c.id, stored.allocationTarget?.[c.id] !== undefined ? String(stored.allocationTarget[c.id]) : ''])))
  }, [stored])

  if (rows.length === 0) return null

  const saveTarget = async (target: AllocationTarget | undefined) => {
    setError(null)
    setProblem(null)
    const done = await save({ investorProfile: { ...stored, allocationTarget: target } })
    if (done) setEditing(false)
  }
  const submit = () => {
    const parsed = cleanTarget(Object.fromEntries(ASSET_CLASSES.filter((c) => draft[c.id]?.trim() !== '').map((c) => [c.id, Number(draft[c.id])])))
    if (!parsed) return setProblem('Enter a share for at least one kind.')
    const why = targetProblem(parsed)
    if (why) return setProblem(why)
    void saveTarget(parsed)
  }

  return (
    <>
      <section aria-labelledby="putin-heading" className="card flex flex-col gap-3 p-6">
        <div>
          <h2 id="putin-heading" className="card-title">Put in and worth now</h2>
          <p className="text-slate-400">
            What went in and what it is worth. "Put in" is the first balance on record plus the payments recorded on the account since, so it is only as complete as your records.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{r.name}</span>
                <span className="block text-sm text-slate-400">
                  {r.enough
                    ? `Put in ${formatMoney(r.putIn, r.currency)} since ${r.since.slice(0, 10)}`
                    : 'Not enough history yet. Update this account\'s balance now and then, and the change shows here.'}
                </span>
              </span>
              <span className="text-left sm:text-right">
                <span className="block font-semibold tabular-nums text-ink">{formatMoney(r.worth, r.currency)}</span>
                {r.enough && (
                  <span className="block text-sm tabular-nums text-slate-300">
                    {signed(r.change, r.currency)}{r.changeShare !== null ? ` (${r.change > 0 ? '+' : ''}${pct(r.changeShare)})` : ''}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-400">The change is not a yearly return, and fees, tax and timing are not taken out.</p>
      </section>

      <section aria-labelledby="alloc-heading" className="card flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="alloc-heading" className="card-title">How it is spread</h2>
            <p className="text-slate-400">
              Your investment and retirement accounts by kind, from each account's type. {stored.allocationTarget ? 'Compared with the target you set.' : 'Set a target to see how far you are from it.'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close' : stored.allocationTarget ? 'Change target' : 'Set a target'}
          </button>
        </div>

        {editing && (
          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <p className="text-sm text-slate-300">Your own target as whole percentages. Leave a kind empty if you want none of it. They need to add up to 100.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {ASSET_CLASSES.map((c) => (
                <label key={c.id} className="flex flex-col gap-1 text-sm font-medium text-ink" htmlFor={`target-${c.id}`}>
                  {c.label}
                  <input
                    id={`target-${c.id}`}
                    className={inputClass}
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="0"
                    value={draft[c.id] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.id as AssetClassId]: e.target.value.replace(/\D/g, '') }))}
                  />
                </label>
              ))}
            </div>
            <ErrorNote>{problem || error}</ErrorNote>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>Save target</button>
              {stored.allocationTarget && <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void saveTarget(undefined)}>Remove target</button>}
            </div>
          </div>
        )}

        {allocations.map((a) => {
          const notes = driftNotes(a)
          return (
            <div key={a.currency} className="flex flex-col gap-3">
              {allocations.length > 1 && <h3 className="eyebrow">{a.currency}</h3>}
              {a.total <= 0 ? (
                <p className="text-slate-400">Nothing recorded in {a.currency} yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {a.lines.map((l) => (
                    <li key={l.id} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                        <span className="font-medium text-ink">{l.label}</span>
                        <span className="tabular-nums text-ink">
                          {pct(l.share)} <span className="text-slate-400">- {formatMoney(l.value, a.currency)}</span>
                        </span>
                      </span>
                      <span className="relative block h-2 rounded-full bg-tint" role="img" aria-label={`${Math.round(l.share * 100)} percent${l.target !== undefined ? `, target ${l.target} percent` : ''}`}>
                        <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(l.share > 0 ? 2 : 0, l.share * 100))}%` }} />
                        {l.target !== undefined && <span className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `${Math.min(99.5, l.target)}%` }} aria-hidden />}
                      </span>
                      {l.target !== undefined && (
                        <span className="text-sm text-slate-400">
                          Target {l.target}%{l.drift !== undefined && Math.abs(l.drift) >= 0.5 ? `, ${l.drift > 0 ? '+' : ''}${l.drift} points` : ', on target'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {notes.length > 0 && (
                <ul className="m-0 flex list-disc flex-col gap-1 rounded-xl bg-tint p-4 pl-8 text-slate-300">
                  {notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
          )
        })}
        <p className="text-sm text-slate-400">
          Kinds come from account types, so a depot counts as funds even if it holds some shares, unless you list its holdings with prices (expert mode), which then split it. A gap from your target is information, not an instruction;
          what to do about it is your decision. <Link to="/ask-ai" className="font-semibold text-accent">Think it through with your AI</Link>
        </p>
      </section>
    </>
  )
}
