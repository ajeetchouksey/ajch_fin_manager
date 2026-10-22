import { useMemo, useState } from 'react'
import { Building2, CreditCard, Home, Landmark, Plus, Shield, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ConnectDrive } from '../components/ledger/ConnectDrive'
import { AccountDialog } from '../components/portfolio/AccountDialog'
import { ErrorNote } from '../components/ledger/ui'
import { useLedger } from '../context/LedgerContext'
import { useReview } from '../hooks/useReview'
import { accountBalances } from '../lib/ledger/balances'
import { isTransfer } from '../lib/ledger/categorize'
import { accountType, type Account, type AccountGroup } from '../lib/ledger/portfolio'
import { formatMoney, todayIso, type Transaction } from '../lib/ledger/types'

const GROUP_COLOR: Record<AccountGroup, string> = {
  cash: 'var(--color-cat-housing)',
  investments: 'var(--color-cat-groceries)',
  retirement: 'var(--color-cat-travel)',
  property: 'var(--color-cat-transport)',
  debt: 'var(--color-spend)',
  cover: 'var(--color-cat-insurance)',
}
const GROUP_ORDER: AccountGroup[] = ['cash', 'investments', 'retirement', 'property', 'debt', 'cover']

/** "Complete your picture" tiles (design): one per kind of account the user has not added yet. */
const PICTURE: Array<{ type: string; group: AccountGroup | 'current'; name: string; note: string; icon: LucideIcon }> = [
  { type: 'current', group: 'current', name: 'Current account', note: 'Where salary arrives', icon: Wallet },
  { type: 'brokerage', group: 'investments', name: 'Investments', note: 'ETF depot, shares', icon: TrendingUp },
  { type: 'pension', group: 'retirement', name: 'Pension', note: 'Company or private', icon: Landmark },
  { type: 'property', group: 'property', name: 'Property', note: 'Home or land', icon: Home },
  { type: 'loan', group: 'debt', name: 'Loans', note: 'Home loan, car', icon: Building2 },
  { type: 'credit_card', group: 'debt', name: 'Cards', note: 'Credit cards', icon: CreditCard },
  { type: 'ins_liability', group: 'cover', name: 'Insurance', note: 'Liability, health, home', icon: Shield },
]

const longDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Transactions that belong to an account: linked by id, or labelled with its name. */
const belongs = (t: Transaction, a: Account) => (t.accountId ? t.accountId === a.id : !!t.account && t.account.trim().toLowerCase() === a.name.trim().toLowerCase())

/** Accounts (design): one card per account with balance and this year's flow, then "Complete your picture". */
export function AccountsPage() {
  const { status, accounts, balances, transactions, error } = useLedger()
  const { review } = useReview()
  const [open, setOpen] = useState<{ existing?: Account; type?: string } | null>(null)
  const today = todayIso()
  const year = today.slice(0, 4)
  const nw = review.netWorth

  const rows = useMemo(() => {
    const byCur = new Map<string, ReturnType<typeof accountBalances>>()
    for (const c of new Set(accounts.map((a) => a.currency))) byCur.set(c, accountBalances(accounts, c, balances, transactions, today))
    return accounts
      .map((a) => {
        const r = byCur.get(a.currency)?.rows.find((x) => x.id === a.id)
        const mine = transactions.filter((t) => belongs(t, a))
        const thisYear = mine.filter((t) => t.date.startsWith(year) && !isTransfer(t))
        const first = mine.reduce((m, t) => (!m || t.date < m ? t.date : m), '')
        return {
          a,
          t: accountType(a.type),
          balance: r?.balance ?? a.balance,
          asOf: r?.asOf ?? a.asOf,
          count: mine.length,
          first,
          inYear: thisYear.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0),
          outYear: thisYear.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0),
        }
      })
      .sort((x, y) => GROUP_ORDER.indexOf(x.t.group) - GROUP_ORDER.indexOf(y.t.group))
  }, [accounts, balances, transactions, today, year])

  const have = new Set(accounts.map((a) => accountType(a.type).group as string))
  if (accounts.some((a) => a.type === 'current')) have.add('current')
  const missing = PICTURE.filter((p) => !have.has(p.group) || (p.type === 'credit_card' && !accounts.some((a) => a.type === 'credit_card')))

  if (status !== 'ready') {
    return (
      <>
        <PageHeader title="Accounts" />
        <div className="card"><ConnectDrive context="transactions" /></div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} tracked` : 'No accounts yet'}
        title="Accounts"
        actions={<button type="button" className="btn btn-primary" onClick={() => setOpen({})}><Plus className="h-4 w-4" strokeWidth={2.4} /> Add account</button>}
      />
      <ErrorNote>{error}</ErrorNote>

      {accounts.length > 1 && (
        <section aria-label="Net worth" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Net worth', value: nw.netWorth, cls: nw.netWorth < 0 ? 'text-bad' : 'text-ink' },
            { label: 'You own', value: nw.assets, cls: 'text-ink' },
            { label: 'You owe', value: nw.liabilities, cls: nw.liabilities ? 'text-bad' : 'text-ink' },
          ].map((s) => (
            <div key={s.label} className="card flex flex-col gap-1 rounded-[14px] px-4 py-3 sm:px-5 sm:py-4">
              <span className="text-sm text-slate-400">{s.label}</span>
              <span className={`font-display text-[22px] leading-tight font-bold tabular-nums sm:text-[28px] ${s.cls}`}>{formatMoney(s.value, nw.currency)}</span>
            </div>
          ))}
        </section>
      )}
      {nw.otherCurrencies.length > 0 && (
        <p className="text-sm text-slate-400">Totals are in {nw.currency}; accounts in {nw.otherCurrencies.map((o) => o.currency).join(', ')} are shown but not added in.</p>
      )}

      {rows.map(({ a, t, balance, asOf, count, first, inYear, outYear }) => {
        const color = GROUP_COLOR[t.group]
        const stale = asOf && Date.now() - Date.parse(asOf) > 60 * 86_400_000
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen({ existing: a })}
            aria-label={`${a.name}: edit`}
            className="card grid grid-cols-1 items-center gap-6 border-l-0 p-6 text-left hover:border-tintline sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] sm:p-7"
            style={{ boxShadow: `inset 6px 0 0 ${color}` }}
          >
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] font-display text-lg font-bold text-ink" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}>
                {a.currency}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-lg font-semibold text-ink">{a.name}</span>
                <span className="truncate text-slate-400">{[a.institution, t.label.split(' (')[0]].filter(Boolean).join(' · ')}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-400">{t.group === 'debt' ? 'Owed' : t.group === 'cover' ? 'Cover' : 'Balance'}</span>
              <span className={`font-display text-[40px] leading-none font-bold tabular-nums ${t.group === 'debt' ? 'text-bad' : 'text-ink'}`}>
                {t.group === 'cover' && !balance ? '—' : formatMoney(balance, a.currency)}
              </span>
              {asOf && <span className={`text-[13px] ${stale ? 'text-warn-text' : 'text-slate-500'}`}>as of {longDate(asOf)}{stale ? ' · update balance' : ''}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <span className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">{t.group === 'debt' ? 'Interest rate' : 'Interest'}</span><span className="font-semibold text-ink">{(a.rate ?? t.defaultRate).toLocaleString()}%</span></span>
              <span className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">{count || !a.monthly ? 'Transactions' : t.monthlyLabel ?? 'Monthly'}</span><span className="font-semibold text-ink">{count ? `${count} since ${shortDate(first)}` : a.monthly ? `${formatMoney(a.monthly, a.currency)} a month` : 'None linked'}</span></span>
              <span className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">In this year</span><span className="font-semibold tabular-nums text-good">{formatMoney(inYear, a.currency)}</span></span>
              <span className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Spent this year</span><span className="font-semibold tabular-nums text-bad">{formatMoney(outYear, a.currency)}</span></span>
            </div>
          </button>
        )
      })}

      {missing.length > 0 && (
        <section aria-labelledby="add-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="add-heading" className="card-title text-2xl">{accounts.length ? 'Complete your picture' : 'Add your first account'}</h2>
            <span className="text-slate-400">Net worth only counts what's tracked. Add the rest to see the full view.</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {missing.map(({ type, name, note, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => setOpen({ type })}
                className="flex min-h-[88px] items-center gap-3.5 rounded-2xl border border-dashed border-line-strong bg-surface p-5 text-left hover:border-tintline hover:bg-tint"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${GROUP_COLOR[accountType(type).group]} 22%, transparent)` }}>
                  <Icon className="h-[22px] w-[22px] text-ink" aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink">{name}</span>
                  <span className="text-[13px] text-slate-400">{note}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {open && <AccountDialog existing={open.existing} initialType={open.type} onClose={() => setOpen(null)} />}
    </div>
  )
}
