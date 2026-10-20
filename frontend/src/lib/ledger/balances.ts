import { accountType, GROUP_LABELS, type Account, type AccountGroup } from './portfolio'

/** One account as shown on the Overview: its current balance and how it counts. */
export interface AccountBalanceRow {
  id: string
  name: string
  institution: string
  group: AccountGroup
  groupLabel: string
  /** The balance as entered (positive). For debts this is the amount owed. */
  balance: number
  asOf: string
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

/** Balances of the accounts in one currency, grouped in the order the app uses. Never converts currencies. */
export function accountBalances(accounts: Account[], currency: string): AccountBalances {
  const rows: AccountBalanceRow[] = accounts
    .filter((a) => (a.currency || 'EUR').toUpperCase() === currency.toUpperCase())
    .map((a) => {
      const group = accountType(a.type).group
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        group,
        groupLabel: GROUP_LABELS[group],
        balance: a.balance,
        asOf: a.asOf,
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
  const round = (n: number) => Math.round(n * 100) / 100
  return { rows, assets: round(assets), debts: round(debts), net: round(assets - debts) }
}
