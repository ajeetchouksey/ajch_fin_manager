import { accountType, GROUP_LABELS, type Account, type AccountGroup, type BalanceEntry } from './portfolio'
import type { Transaction } from './types'

/** What a current balance is built from, so the card can say so. */
export interface BalanceBasis {
  /** The last balance entered or read from a statement */
  anchorBalance: number
  anchorDate: string
  /** Transactions dated after the anchor that belong to this account */
  transactionsSince: number
  /** Money in minus money out since the anchor, as the account sees it (debts: amount owed) */
  changeSince: number
}

/** One account as shown on the Overview: its current balance and how it counts. */
export interface AccountBalanceRow {
  id: string
  name: string
  institution: string
  group: AccountGroup
  groupLabel: string
  /** Current balance: the last entered or statement balance, plus the transactions since. Positive; for debts, the amount owed. */
  balance: number
  /** Date of the anchor balance */
  asOf: string
  basis: BalanceBasis
  /** Counted in net worth. Insurance is listed but not counted, as elsewhere in the app. */
  counted: boolean
}

export interface AccountBalances {
  rows: AccountBalanceRow[]
  /** Cash, investments, retirement and property */
  assets: number
  /** Amounts owed, as a positive number */
  debts: number
  /** assets − debts, counted accounts only */
  net: number
}

const GROUP_ORDER: AccountGroup[] = ['cash', 'investments', 'retirement', 'property', 'debt', 'cover']
const round = (n: number) => Math.round(n * 100) / 100

/** Transactions belong to an account by its id, or by its name for rows saved before ids existed. */
export function belongsTo(t: Pick<Transaction, 'accountId' | 'account'>, account: Pick<Account, 'id' | 'name'>): boolean {
  return t.accountId ? t.accountId === account.id : t.account === account.name
}

/**
 * The current balance of one account. The anchor is its latest entered or statement balance on or before today;
 * the transactions dated after that anchor, up to today, move it. Debts go up with money out and down with money in.
 */
export function currentBalance(account: Account, history: BalanceEntry[], transactions: Transaction[], today: string): { balance: number; basis: BalanceBasis } {
  const past = history.filter((h) => h.accountId === account.id && h.date <= today).sort((a, b) => b.date.localeCompare(a.date))
  const anchor = past[0] ?? { date: account.asOf, balance: account.balance }
  const isDebt = accountType(account.type).group === 'debt'

  let changeSince = 0
  let count = 0
  for (const t of transactions) {
    if (t.date <= anchor.date || t.date > today || !belongsTo(t, account)) continue
    count++
    // Money out lowers an asset and raises a debt; money in does the reverse
    const outward = t.direction === 'out'
    changeSince += outward === isDebt ? t.amount : -t.amount
  }
  const balance = round(anchor.balance + changeSince)
  return {
    balance,
    basis: { anchorBalance: anchor.balance, anchorDate: anchor.date, transactionsSince: count, changeSince: round(changeSince) },
  }
}

/**
 * Balances of the accounts in one currency, grouped in the order the app uses. Never converts currencies.
 * Without history or transactions, each balance is the one entered on the account.
 */
export function accountBalances(
  accounts: Account[],
  currency: string,
  history: BalanceEntry[] = [],
  transactions: Transaction[] = [],
  today: string = new Date().toISOString().slice(0, 10),
): AccountBalances {
  const rows: AccountBalanceRow[] = accounts
    .filter((a) => (a.currency || 'EUR').toUpperCase() === currency.toUpperCase())
    .map((a) => {
      const group = accountType(a.type).group
      const { balance, basis } = currentBalance(a, history, transactions, today)
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        group,
        groupLabel: GROUP_LABELS[group],
        balance,
        asOf: basis.anchorDate,
        basis,
        counted: group !== 'cover',
      }
    })
    .sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || y.balance - x.balance)

  let assets = 0
  let debts = 0
  for (const r of rows) {
    if (!r.counted) continue
    if (r.group === 'debt') debts += r.balance
    else assets += r.balance
  }
  return { rows, assets: round(assets), debts: round(debts), net: round(assets - debts) }
}
