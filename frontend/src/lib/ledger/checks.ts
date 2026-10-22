import { TRANSFER_CATEGORY, suggestCategory } from './categorize'
import { groupPayees, type PayeeGroup } from './payees'
import { privately } from './privacy'
import type { Transaction } from './types'

/**
 * "Worth checking": things in the Ledger that look wrong and are quick to fix. Each check says what
 * it found, which rows, and (when there is one) the category it suggests. Nothing is changed here.
 * Shared by the web app and the connector, so both show the same list.
 */

export type CheckKind =
  | 'own-transfer'
  | 'likely-salary'
  | 'category-drift'
  | 'payee-variants'
  | 'double-payment'
  | 'missing-payment'
  | 'other-share'

export interface Check {
  id: string
  kind: CheckKind
  title: string
  detail: string
  transactionIds: string[]
  /** Category to apply to transactionIds, when the check has one */
  suggestedCategory?: string
}

export interface CheckOptions {
  /** The user's own name(s): payments to or from them should be transfers */
  ownNames?: string[]
  /** Flag a month whose "Other" spending is above this share (default 10%) */
  otherShareLimit?: number
  /** Month to check the Other share for (YYYY-MM); default the latest month with spending */
  month?: string
}

const OTHER = /^other( income)?$/i
const SAVINGS = 'Savings & investments'
const month = (t: Transaction) => t.date.slice(0, 7)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(a, b)
const money = (n: number, currency = 'EUR') => {
  try {
    return privately(new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n))
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** '2026-08' → 'August 2026' */
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`

function monthsBetween(a: string, b: string): string[] {
  const out: string[] = []
  let [y, m] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  while (y < yb || (y === yb && m <= mb)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

function ownTransfers(tx: Transaction[], ownNames: string[]): Check[] {
  if (!ownNames.length) return []
  const hits = tx.filter((t) => {
    if (t.category === TRANSFER_CATEGORY || t.category === SAVINGS) return false
    const s = suggestCategory(t.description, t.direction, undefined, { ownNames })
    return s?.source === 'own-name'
  })
  if (!hits.length) return []
  return [
    {
      id: 'own-transfer',
      kind: 'own-transfer',
      title: `${plural(hits.length, 'payment')} to or from your own name`,
      detail: 'These look like money moved between your own accounts. As transfers they stay out of income and spending.',
      transactionIds: hits.map((t) => t.id),
      suggestedCategory: TRANSFER_CATEGORY,
    },
  ]
}

function likelySalary(groups: PayeeGroup[]): Check[] {
  const out: Check[] = []
  for (const g of groups) {
    const rows = g.tx.filter((t) => t.direction === 'in' && t.category !== 'Salary' && t.category !== TRANSFER_CATEGORY)
    const months = new Set(rows.map(month))
    if (months.size < 3) continue
    const amounts = rows.map((t) => t.amount)
    const m = median(amounts)
    if (m < 1000) continue
    const steady = rows.filter((t) => near(t.amount, m, 0.25))
    if (new Set(steady.map(month)).size < 3) continue
    out.push({
      id: `likely-salary:${g.key}`,
      kind: 'likely-salary',
      title: `${g.label} looks like your salary`,
      detail: `${plural(steady.length, 'payment')} of about ${money(m, rows[0].currency)} a month, not marked as Salary. Salary cycles and income totals use the Salary category.`,
      transactionIds: steady.map((t) => t.id),
      suggestedCategory: 'Salary',
    })
  }
  return out
}

function categoryDrift(groups: PayeeGroup[]): Check[] {
  const out: Check[] = []
  for (const g of groups) {
    for (const dir of ['out', 'in'] as const) {
      const rows = g.tx.filter((t) => t.direction === dir && t.category !== TRANSFER_CATEGORY)
      if (rows.length < 3) continue
      const count = new Map<string, number>()
      for (const t of rows) if (!OTHER.test(t.category)) count.set(t.category, (count.get(t.category) ?? 0) + 1)
      const [top, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
      if (!top || n / rows.length < 0.6) continue
      const odd = rows.filter((t) => t.category !== top)
      if (!odd.length) continue
      out.push({
        id: `category-drift:${dir}:${g.key}`,
        kind: 'category-drift',
        title: `${g.label}: ${plural(odd.length, 'payment')} not in ${top}`,
        detail: `${n} of ${rows.length} payments to this payee are ${top}; the rest are ${[...new Set(odd.map((t) => t.category))].join(', ')}.`,
        transactionIds: odd.map((t) => t.id),
        suggestedCategory: top,
      })
    }
  }
  return out
}

function payeeVariants(groups: PayeeGroup[]): Check[] {
  return groups
    .filter((g) => g.keys.length > 1 && g.tx.length >= 2)
    .map((g) => ({
      id: `payee-variants:${g.key}`,
      kind: 'payee-variants' as const,
      title: `${g.label} is spelled ${g.keys.length} ways`,
      detail: `Seen as: ${g.keys.join(' · ')}. They are counted together as one payee.`,
      transactionIds: g.tx.map((t) => t.id),
    }))
}

function monthlyPayments(groups: PayeeGroup[]): Check[] {
  const out: Check[] = []
  for (const g of groups) {
    const rows = g.tx.filter((t) => t.direction === 'out' && t.category !== TRANSFER_CATEGORY)
    const byMonth = new Map<string, Transaction[]>()
    for (const t of rows) byMonth.set(month(t), [...(byMonth.get(month(t)) ?? []), t])
    const ms = [...byMonth.keys()].sort()
    if (ms.length < 3) continue
    const span = monthsBetween(ms[0], ms[ms.length - 1])
    const single = ms.filter((m) => byMonth.get(m)!.length === 1).length
    // Only regular monthly payments: most months present, and mostly one payment per month
    if (ms.length / span.length < 0.75 || single / ms.length < 0.75) continue
    const m = median(rows.map((t) => t.amount))
    for (const mo of ms) {
      const same = byMonth.get(mo)!.filter((t) => near(t.amount, m, 0.1))
      if (same.length >= 2) {
        out.push({
          id: `double-payment:${g.key}:${mo}`,
          kind: 'double-payment',
          title: `${g.label} paid ${same.length} times in ${monthLabel(mo)}`,
          detail: `Usually once a month (about ${money(m, rows[0].currency)}). Check whether one is a duplicate or a refund is missing.`,
          transactionIds: same.map((t) => t.id),
        })
      }
    }
    const missing = span.filter((mo) => !byMonth.has(mo))
    if (missing.length) {
      out.push({
        id: `missing-payment:${g.key}`,
        kind: 'missing-payment',
        title: `${g.label} missing in ${missing.map(monthLabel).join(', ')}`,
        detail: `Paid most months (about ${money(m, rows[0].currency)}). The payment may be under another name, or not imported yet.`,
        transactionIds: [],
      })
    }
  }
  return out
}

function otherShare(tx: Transaction[], limit: number, wanted?: string): Check[] {
  const spend = tx.filter((t) => t.direction === 'out' && t.category !== TRANSFER_CATEGORY)
  const mo = wanted ?? spend.map(month).sort().pop()
  if (!mo) return []
  const inMonth = spend.filter((t) => month(t) === mo)
  const total = inMonth.reduce((s, t) => s + t.amount, 0)
  const other = inMonth.filter((t) => OTHER.test(t.category))
  const sum = other.reduce((s, t) => s + t.amount, 0)
  if (!total || sum / total <= limit) return []
  return [
    {
      id: `other-share:${mo}`,
      kind: 'other-share',
      title: `${Math.round((sum / total) * 100)}% of ${monthLabel(mo)} spending is in Other`,
      detail: `${money(sum, other[0].currency)} across ${plural(other.length, 'payment')}. Giving them a category makes budgets and reports more useful.`,
      transactionIds: other.map((t) => t.id),
    },
  ]
}

const ORDER: CheckKind[] = ['own-transfer', 'likely-salary', 'double-payment', 'category-drift', 'other-share', 'missing-payment', 'payee-variants']

/** Everything worth checking in these transactions, most useful first. */
export function worthChecking(tx: Transaction[], options: CheckOptions = {}): Check[] {
  const groups = groupPayees(tx)
  const all = [
    ...ownTransfers(tx, options.ownNames ?? []),
    ...likelySalary(groups),
    ...categoryDrift(groups),
    ...payeeVariants(groups),
    ...monthlyPayments(groups),
    ...otherShare(tx, options.otherShareLimit ?? 0.1, options.month),
  ]
  return all.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}
