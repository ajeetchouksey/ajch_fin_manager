import { useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { AccountDialog } from '../components/portfolio/AccountDialog'
import { ErrorNote } from '../components/ledger/ui'
import { useLedger } from '../context/LedgerContext'
import { useReview } from '../hooks/useReview'
import { GROUP_LABELS, accountType, type Account, type AccountGroup } from '../lib/ledger/portfolio'
import { formatMoney } from '../lib/ledger/types'

const GROUP_ORDER: AccountGroup[] = ['cash', 'investments', 'retirement', 'property', 'debt', 'cover']

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className={`mt-1 font-display text-[28px] leading-tight font-semibold tabular-nums ${tone === 'bad' ? 'text-amber-200' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

export function AccountsPage() {
  const { status, accounts, error } = useLedger()
  const { review } = useReview()
  const [open, setOpen] = useState<{ existing?: Account; type?: string } | null>(null)
  const nw = review.netWorth
  const cur = nw.currency

  const actions =
    status === 'ready' ? (
      <button type="button" className="btn btn-primary" onClick={() => setOpen({})}>
        <Plus className="h-4 w-4" /> Add account
      </button>
    ) : undefined

  return (
    <>
      <PageHeader eyebrow="Finance" title="Accounts" description="What you own, owe and are insured for. Kept in your Ledger." actions={actions} />
      {status !== 'ready' ? (
        <div className="card"><ConnectDrive context="transactions" /></div>
      ) : !accounts.length ? (
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add your current and savings accounts, investments, pension, loans and insurance with today’s balance. That unlocks net worth, the emergency-fund check and your forecast."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setOpen({ type: 'current' })}><Plus className="h-4 w-4" /> Bank account</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ type: 'brokerage' })}>Investment</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ type: 'loan' })}>Loan</button>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ type: 'ins_liability' })}>Insurance</button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Net worth" value={formatMoney(nw.netWorth, cur)} tone={nw.netWorth < 0 ? 'bad' : undefined} />
            <Stat label="You own" value={formatMoney(nw.assets, cur)} />
            <Stat label="You owe" value={formatMoney(nw.liabilities, cur)} />
          </div>
          {nw.otherCurrencies.length > 0 && (
            <p className="text-sm text-slate-400">
              Totals are in {cur}. {nw.otherCurrencies.map((o) => `${o.count} in ${o.currency}`).join(', ')} {nw.otherCurrencies.reduce((a, o) => a + o.count, 0) === 1 ? 'is' : 'are'} listed below but not added in, because no exchange rate is assumed.
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>
          {GROUP_ORDER.map((g) => {
            const list = accounts.filter((a) => accountType(a.type).group === g)
            if (!list.length) return null
            const total = list.filter((a) => a.currency === cur).reduce((s, a) => s + a.balance, 0)
            return (
              <section key={g} className="card overflow-hidden p-0" aria-labelledby={`grp-${g}`}>
                <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                  <h2 id={`grp-${g}`} className="font-semibold text-ink">{GROUP_LABELS[g]}</h2>
                  {g !== 'cover' && <span className="text-sm tabular-nums text-slate-400">{formatMoney(total, cur)}</span>}
                </header>
                <ul className="divide-y divide-line">
                  {list.map((a) => {
                    const t = accountType(a.type)
                    const stale = a.asOf && Date.now() - Date.parse(a.asOf) > 60 * 86_400_000
                    return (
                      <li key={a.id}>
                        <button type="button" onClick={() => setOpen({ existing: a })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-wash/[0.03] sm:px-5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-ink">{a.name}</span>
                            <span className="block truncate text-xs text-slate-400">
                              {t.label}
                              {a.institution ? ` · ${a.institution}` : ''}
                              {a.monthly ? ` · ${formatMoney(a.monthly, a.currency)}/month` : ''}
                              {g !== 'cover' && a.asOf ? ` · as of ${a.asOf}` : ''}
                              {stale && <span className="text-amber-200"> · update balance</span>}
                            </span>
                          </span>
                          {(g !== 'cover' || a.balance > 0) && (
                            <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${g === 'debt' ? 'text-amber-200' : 'text-ink'}`}>
                              {g === 'debt' ? '−' : ''}{formatMoney(a.balance, a.currency)}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {open && <AccountDialog existing={open.existing} initialType={open.type} onClose={() => setOpen(null)} />}
    </>
  )
}

