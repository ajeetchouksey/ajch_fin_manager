import { TRANSFER_CATEGORY, suggestCategory } from './categorize'
import { belongsTo } from './balances'
import { accountType, type Account, type BalanceEntry } from './portfolio'
import { groupPayees, type PayeeGroup } from './payees'
import { privately } from './privacy'
import { todayIso, type Transaction } from './types'

/**
 * "Worth checking": things in the Ledger that look wrong and are quick to fix. Each check says what
 * it found, which rows, and (when there is one) the category it suggests. Nothing is changed here.
 * Shared by the web app and the connector, so both show the same list.
 */

export type CheckKind =
  | 'own-transfer'
  | 'transfer-pair'
  | 'refund-pair'
  | 'missing-category'
  | 'odd-date'
  | 'price-change'
  | 'series-stopped'
  | 'balance-drift'
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
  /** Today (YYYY-MM-DD) for the date checks; default the real today */
  today?: string
  /** With the Balances history, cash and debt accounts are checked against their statement balances */
  accounts?: Account[]
  balances?: BalanceEntry[]
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

/** Two rows that look like the two legs of one move between the user's own accounts. */
export interface TransferPair {
  out: Transaction
  in: Transaction
  /** Days between the two bookings */
  days: number
}

const dayNumber = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / 86_400_000)
const accountKey = (t: Transaction) => (t.accountId || t.account || '').trim().toLowerCase()
const cents = (n: number) => Math.round(n * 100)

/**
 * Pairs a payment out of one account with an equal payment into a different account of the same
 * currency, booked within `maxDays` of each other. Only unambiguous pairs are returned: when more
 * than one row could be the other leg, none is chosen, so the user decides. Rows already marked as
 * Transfer or as Savings & investments are left alone.
 */
export function findTransferPairs(tx: Transaction[], maxDays = 3): TransferPair[] {
  const free = tx.filter((t) => t.category !== TRANSFER_CATEGORY && t.category !== SAVINGS && accountKey(t) && t.amount > 0)
  const outs = free.filter((t) => t.direction === 'out')
  const ins = free.filter((t) => t.direction === 'in')
  const candidates = (t: Transaction, pool: Transaction[]) =>
    pool.filter(
      (u) => u.currency === t.currency && cents(u.amount) === cents(t.amount) && accountKey(u) !== accountKey(t) && Math.abs(dayNumber(u.date) - dayNumber(t.date)) <= maxDays,
    )
  const nearest = (t: Transaction, pool: Transaction[]) => {
    const c = candidates(t, pool)
    if (!c.length) return undefined
    const d = (u: Transaction) => Math.abs(dayNumber(u.date) - dayNumber(t.date))
    const best = Math.min(...c.map(d))
    const top = c.filter((u) => d(u) === best)
    return top.length === 1 ? top[0] : undefined
  }
  const pairs: TransferPair[] = []
  for (const o of outs) {
    const i = nearest(o, ins)
    if (!i || nearest(i, outs) !== o) continue
    pairs.push({ out: o, in: i, days: Math.abs(dayNumber(i.date) - dayNumber(o.date)) })
  }
  return pairs
}

function transferPairChecks(tx: Transaction[]): Check[] {
  const pairs = findTransferPairs(tx)
  if (!pairs.length) return []
  const first = pairs[0]
  return [
    {
      id: 'transfer-pair',
      kind: 'transfer-pair',
      title: `${plural(pairs.length, 'move')} between your own accounts counted as income and spending`,
      detail: `For example ${money(first.out.amount, first.out.currency)} out of ${first.out.account || 'one account'} and into ${first.in.account || 'another'} within ${plural(first.days, 'day')}. As transfers both rows stay out of income and spending.`,
      transactionIds: pairs.flatMap((p) => [p.out.id, p.in.id]),
      suggestedCategory: TRANSFER_CATEGORY,
    },
  ]
}

/** A refund: money in that comes back from a payee we paid earlier, and the purchase it undoes. */
export interface RefundPair {
  refund: Transaction
  purchase: Transaction
}

/**
 * Links money coming in from a payee to the one earlier payment it undoes: same payee spelling,
 * same currency, paid at most `maxDays` before, and not more than the purchase. A payment of the
 * exact same amount wins; otherwise there must be exactly one possible purchase, so a partial
 * refund is never guessed. Salary and transfers are left alone.
 */
export function findRefunds(tx: Transaction[], groups: PayeeGroup[] = groupPayees(tx), maxDays = 60): RefundPair[] {
  const groupOf = new Map<string, string>()
  for (const g of groups) for (const t of g.tx) groupOf.set(t.id, g.key)
  const skip = (t: Transaction) => t.category === TRANSFER_CATEGORY || t.category === 'Salary' || t.category === SAVINGS
  const outs = tx.filter((t) => t.direction === 'out' && t.amount > 0 && !skip(t))
  const out: RefundPair[] = []
  const used = new Set<string>()
  const ins = tx.filter((t) => t.direction === 'in' && t.amount > 0 && !skip(t)).sort((a, b) => a.date.localeCompare(b.date))
  for (const r of ins) {
    const key = groupOf.get(r.id)
    const age = (p: Transaction) => dayNumber(r.date) - dayNumber(p.date)
    const pool = outs.filter(
      (p) => !used.has(p.id) && groupOf.get(p.id) === key && p.currency === r.currency && age(p) >= 0 && age(p) <= maxDays && cents(p.amount) >= cents(r.amount),
    )
    const exact = pool.filter((p) => cents(p.amount) === cents(r.amount))
    const pick = exact.length ? (exact.length === 1 ? exact[0] : undefined) : pool.length === 1 ? pool[0] : undefined
    if (!pick) continue
    used.add(pick.id)
    out.push({ refund: r, purchase: pick })
  }
  return out
}

function refundChecks(tx: Transaction[], groups: PayeeGroup[]): Check[] {
  const byCategory = new Map<string, RefundPair[]>()
  for (const p of findRefunds(tx, groups)) {
    if (p.refund.category === p.purchase.category) continue
    byCategory.set(p.purchase.category, [...(byCategory.get(p.purchase.category) ?? []), p])
  }
  return [...byCategory].map(([category, pairs]) => ({
    id: `refund-pair:${category}`,
    kind: 'refund-pair' as const,
    title: `${plural(pairs.length, 'refund')} not netted against ${category}`,
    detail: `For example ${money(pairs[0].refund.amount, pairs[0].refund.currency)} back from ${pairs[0].purchase.description}. In ${category}, spending for that category goes down by the refund instead of income going up.`,
    transactionIds: pairs.map((p) => p.refund.id),
    suggestedCategory: category,
  }))
}

function oddDates(tx: Transaction[], today: string): Check[] {
  const bad = tx.filter((t) => !/^\d{4}-\d{2}-\d{2}/.test(t.date) || Number.isNaN(Date.parse(t.date.slice(0, 10))))
  const future = tx.filter((t) => !bad.includes(t) && t.date.slice(0, 10) > today)
  const out: Check[] = []
  if (bad.length)
    out.push({
      id: 'odd-date:invalid',
      kind: 'odd-date',
      title: `${plural(bad.length, 'payment')} without a readable date`,
      detail: 'Rows without a valid date are left out of months, budgets and reports. Open each one and set the date.',
      transactionIds: bad.map((t) => t.id),
    })
  if (future.length)
    out.push({
      id: 'odd-date:future',
      kind: 'odd-date',
      title: `${plural(future.length, 'payment')} dated in the future`,
      detail: 'Bank rows are never booked ahead. A date in the wrong year or day-and-month swapped is the usual cause.',
      transactionIds: future.map((t) => t.id),
    })
  return out
}

function missingCategory(tx: Transaction[]): Check[] {
  const none = tx.filter((t) => !t.category.trim())
  if (!none.length) return []
  return [
    {
      id: 'missing-category',
      kind: 'missing-category',
      title: `${plural(none.length, 'payment')} without a category`,
      detail: 'Rows with an empty category do not show up in budgets or the spending mix.',
      transactionIds: none.map((t) => t.id),
    },
  ]
}

/**
 * Two statement balances of a cash or debt account, and the transactions booked between them, must
 * add up. When they do not, a payment is missing, entered twice or dated in the wrong period. Only
 * the latest period that is off is reported per account. Investments and property move with the
 * market, so they are not checked.
 */
function balanceDrift(accounts: Account[], history: BalanceEntry[], tx: Transaction[]): Check[] {
  const out: Check[] = []
  for (const a of accounts) {
    const group = accountType(a.type).group
    if (group !== 'cash' && group !== 'debt') continue
    const byDate = new Map<string, BalanceEntry>()
    for (const h of history.filter((x) => x.accountId === a.id).sort((x, y) => x.recordedAt.localeCompare(y.recordedAt))) byDate.set(h.date, h)
    const points = [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date))
    for (let i = points.length - 1; i > 0; i--) {
      const p = points[i - 1]
      const q = points[i]
      const inside = tx.filter((t) => t.date.slice(0, 10) > p.date && t.date.slice(0, 10) <= q.date && belongsTo(t, a))
      const change = inside.reduce((s, t) => s + ((t.direction === 'out') === (group === 'debt') ? t.amount : -t.amount), 0)
      const off = Math.round((q.balance - (p.balance + change)) * 100) / 100
      if (Math.abs(off) < 0.01) continue
      out.push({
        id: `balance-drift:${a.id}:${q.date}`,
        kind: 'balance-drift',
        title: `${a.name}: payments between ${p.date} and ${q.date} do not add up to the balance`,
        detail: `The balance went from ${money(p.balance, a.currency)} to ${money(q.balance, a.currency)}, but the ${plural(inside.length, 'payment')} in between explain ${money(p.balance + change, a.currency)}: ${money(Math.abs(off), a.currency)} ${off > 0 ? 'more' : 'less'} than expected. A payment may be missing, entered twice or dated in the wrong period.`,
        transactionIds: inside.map((t) => t.id),
      })
      break
    }
  }
  return out
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

function monthlyPayments(groups: PayeeGroup[], thisMonth: string): Check[] {
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
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const last = sorted[sorted.length - 1]
    const before = sorted.slice(-7, -1)
    const base = median(before.map((t) => t.amount))
    const steady = before.length >= 2 && before.every((t) => near(t.amount, base, 0.02))
    if (steady && last.currency === before[0].currency && !near(last.amount, base, 0.03) && Math.abs(last.amount - base) >= 0.5) {
      const pct = Math.round(((last.amount - base) / base) * 100)
      out.push({
        id: `price-change:${g.key}`,
        kind: 'price-change',
        title: `${g.label} ${last.amount > base ? 'went up' : 'went down'} ${Math.abs(pct)}%`,
        detail: `Paid about ${money(base, last.currency)} a month, then ${money(last.amount, last.currency)} on ${last.date.slice(0, 10)}. Worth knowing if you did not agree to a new price.`,
        transactionIds: [last.id],
      })
    }
    const idle = monthsBetween(ms[ms.length - 1], thisMonth).length - 1
    if (ms.length >= 4 && idle >= 2 && ms[ms.length - 1] < thisMonth) {
      out.push({
        id: `series-stopped:${g.key}`,
        kind: 'series-stopped',
        title: `${g.label} has not been paid for ${plural(idle, 'month')}`,
        detail: `Paid most months until ${monthLabel(ms[ms.length - 1])} (about ${money(m, rows[0].currency)}). Cancelled on purpose, or paid under another name?`,
        transactionIds: [],
      })
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

const ORDER: CheckKind[] = ['own-transfer', 'transfer-pair', 'refund-pair', 'balance-drift', 'odd-date', 'missing-category', 'likely-salary', 'double-payment', 'price-change', 'series-stopped', 'category-drift', 'other-share', 'missing-payment', 'payee-variants']

/** Everything worth checking in these transactions, most useful first. */
export function worthChecking(tx: Transaction[], options: CheckOptions = {}): Check[] {
  const groups = groupPayees(tx)
  const all = [
    ...ownTransfers(tx, options.ownNames ?? []),
    ...transferPairChecks(tx),
    ...balanceDrift(options.accounts ?? [], options.balances ?? [], tx),
    ...refundChecks(tx, groups),
    ...oddDates(tx, options.today ?? todayIso()),
    ...missingCategory(tx),
    ...likelySalary(groups),
    ...categoryDrift(groups),
    ...payeeVariants(groups),
    ...monthlyPayments(groups, (options.today ?? todayIso()).slice(0, 7)),
    ...otherShare(tx, options.otherShareLimit ?? 0.1, options.month),
  ]
  return all.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}
