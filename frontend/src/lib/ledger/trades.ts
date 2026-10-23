/**
 * Trades: the buys, sells and dividends of a holding, kept in the Trades tab of the Ledger (append new
 * columns at the end only). From them FinBuddy works out the units held, the average cost, what was gained
 * on what was sold, and the yearly return that accounts for when money went in and out (XIRR).
 *
 * Cost basis here is the average-cost method. It is a way to describe a holding, not a tax calculation:
 * tax rules differ by country and come later, from a dated rules table.
 */

import { parseNumber } from './money'
import { newId } from './types'

export const TRADE_COLUMNS = ['id', 'holding_id', 'account_id', 'date', 'type', 'quantity', 'price', 'amount', 'fee', 'tax', 'currency', 'notes', 'created_at'] as const

export const TRADE_TYPES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'dividend', label: 'Dividend or payout' },
] as const

export type TradeType = (typeof TRADE_TYPES)[number]['value']

export interface Trade {
  id: string
  holdingId: string
  accountId: string
  /** YYYY-MM-DD */
  date: string
  type: TradeType
  /** Units bought or sold; 0 for a dividend */
  quantity: number
  /** Price per unit; 0 for a dividend */
  price: number
  /** Cash received, for a dividend only; 0 otherwise */
  amount: number
  /** Costs of the trade, always positive */
  fee: number
  /** Tax withheld, always positive */
  tax: number
  currency: string
  notes: string
  createdAt: string
  row?: number
}

export type TradeDraft = Omit<Trade, 'id' | 'createdAt' | 'row'>

const str = (v: unknown) => String(v ?? '').trim()
const num = (v: unknown) => {
  const n = parseNumber(v as string | number)
  return n !== null && Number.isFinite(n) ? Math.abs(n) : 0
}
const TYPES = new Set<string>(TRADE_TYPES.map((t) => t.value))
const round = (n: number) => Math.round(n * 100) / 100

export const newTradeId = () => newId('trade')

export function tradeToRow(t: Trade): (string | number)[] {
  return [t.id, t.holdingId, t.accountId, t.date, t.type, t.quantity, t.price, t.amount, t.fee, t.tax, t.currency, t.notes, t.createdAt]
}

export function rowToTrade(r: unknown[], row: number): Trade | null {
  const id = str(r[0])
  const date = str(r[3]).slice(0, 10)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const type = str(r[4])
  return {
    id,
    holdingId: str(r[1]),
    accountId: str(r[2]),
    date,
    type: TYPES.has(type) ? (type as TradeType) : 'buy',
    quantity: num(r[5]),
    price: num(r[6]),
    amount: num(r[7]),
    fee: num(r[8]),
    tax: num(r[9]),
    currency: str(r[10]) || 'EUR',
    notes: str(r[11]),
    createdAt: str(r[12]),
    row,
  }
}

/** Why a trade cannot be saved yet, or null. */
export function tradeProblem(d: Pick<TradeDraft, 'holdingId' | 'date' | 'type' | 'quantity' | 'price' | 'amount' | 'fee' | 'tax'>, today: string): string | null {
  if (!d.holdingId) return 'Pick the holding this belongs to.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Enter the date.'
  if (d.date > today) return 'The date is in the future.'
  if (d.type === 'dividend') {
    if (!(d.amount > 0)) return 'Enter the amount received.'
  } else {
    if (!(d.quantity > 0)) return 'Enter how many units.'
    if (!(d.price > 0)) return 'Enter the price per unit.'
  }
  if (d.fee < 0 || d.tax < 0) return 'Costs and tax cannot be negative.'
  return null
}

const order = (a: Trade, b: Trade) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

export interface Position {
  /** Units held after all trades */
  quantity: number
  /** Average cost per unit of the units still held (fees on buys included); null when nothing is held */
  avgCost: number | null
  /** What the held units cost in total */
  heldCost: number
  /** Gained or lost on units sold, after fees and tax on the sale */
  realised: number
  dividends: number
  /** Total fees and tax across all trades */
  costs: number
  /** Sells that were larger than what was held; the position is kept at zero and the excess is not counted */
  oversold: number
}

/** Units held and their average cost, in date order. Buys add to the cost; a sell removes cost at the current average. */
export function positionFrom(trades: Trade[]): Position {
  let quantity = 0
  let heldCost = 0
  let realised = 0
  let dividends = 0
  let costs = 0
  let oversold = 0
  for (const t of [...trades].sort(order)) {
    costs += t.fee + t.tax
    if (t.type === 'dividend') {
      dividends += t.amount - t.tax
      costs -= t.tax
      continue
    }
    if (t.type === 'buy') {
      quantity += t.quantity
      heldCost += t.quantity * t.price + t.fee
      continue
    }
    const sold = Math.min(t.quantity, quantity)
    if (t.quantity > quantity) oversold += t.quantity - quantity
    const avg = quantity > 0 ? heldCost / quantity : 0
    const share = t.quantity > 0 ? sold / t.quantity : 0
    realised += sold * t.price - (t.fee + t.tax) * share - avg * sold
    heldCost -= avg * sold
    quantity -= sold
  }
  if (quantity < 1e-9) {
    quantity = 0
    heldCost = 0
  }
  return {
    quantity: Math.round(quantity * 1e6) / 1e6,
    avgCost: quantity > 0 ? Math.round((heldCost / quantity) * 1e4) / 1e4 : null,
    heldCost: round(heldCost),
    realised: round(realised),
    dividends: round(dividends),
    costs: round(costs),
    oversold: Math.round(oversold * 1e6) / 1e6,
  }
}

export interface CashFlow {
  date: string
  /** Negative = money put in, positive = money received */
  amount: number
}

const DAY = 86_400_000
const years = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY / 365

/**
 * The yearly rate that makes the dated cash flows add up to zero (XIRR). Needs at least one flow out and one in,
 * and returns null when there is no such rate between -99% and +1000%.
 */
export function xirr(flows: CashFlow[]): number | null {
  const f = flows.filter((c) => Number.isFinite(c.amount) && c.amount !== 0)
  if (!f.some((c) => c.amount < 0) || !f.some((c) => c.amount > 0)) return null
  const t0 = f.reduce((m, c) => (c.date < m ? c.date : m), f[0].date)
  const npv = (rate: number) => f.reduce((s, c) => s + c.amount / Math.pow(1 + rate, years(t0, c.date)), 0)
  let lo = -0.99
  let hi = 10
  const nLo = npv(lo)
  const nHi = npv(hi)
  if (!Number.isFinite(nLo) || !Number.isFinite(nHi) || nLo * nHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const v = npv(mid)
    if (Math.abs(v) < 1e-7) return Math.round(mid * 10000) / 10000
    if (v * nLo > 0) lo = mid
    else hi = mid
  }
  return Math.round(((lo + hi) / 2) * 10000) / 10000
}

export interface HoldingReturn {
  /** Money put in: buys plus their fees */
  invested: number
  /** Money received from sales (after fees and tax) and dividends */
  received: number
  /** Value of what is still held, when a price is known */
  value: number | null
  /** Everything received plus what is still worth, less what was put in */
  gain: number | null
  /** Gain as a share of what was put in */
  gainShare: number | null
  /** Yearly return, only when the first buy was at least this many days ago */
  yearly: number | null
  firstDate: string | null
  /** True when the holding is too young for a yearly rate to mean anything */
  tooShort: boolean
}

/** Shortest time between the first buy and today for which a yearly rate is shown. */
export const MIN_DAYS_FOR_YEARLY = 90

/** The return of one holding from its trades and what the held units are worth today. */
export function returnFrom(trades: Trade[], value: number | null, today: string): HoldingReturn {
  const sorted = [...trades].sort(order)
  let invested = 0
  let received = 0
  const flows: CashFlow[] = []
  for (const t of sorted) {
    if (t.type === 'buy') {
      const out = t.quantity * t.price + t.fee
      invested += out
      flows.push({ date: t.date, amount: -out })
    } else if (t.type === 'sell') {
      const inn = t.quantity * t.price - t.fee - t.tax
      received += inn
      flows.push({ date: t.date, amount: inn })
    } else {
      const inn = t.amount - t.tax
      received += inn
      flows.push({ date: t.date, amount: inn })
    }
  }
  const firstBuy = sorted.find((t) => t.type === 'buy')?.date ?? null
  const gain = value !== null && invested > 0 ? round(received + value - invested) : null
  const tooShort = firstBuy === null || (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstBuy}T00:00:00Z`)) / DAY < MIN_DAYS_FOR_YEARLY
  const yearly = value !== null && !tooShort ? xirr([...flows, { date: today, amount: value }]) : null
  return {
    invested: round(invested),
    received: round(received),
    value,
    gain,
    gainShare: gain !== null && invested > 0 ? Math.round((gain / invested) * 10000) / 10000 : null,
    yearly,
    firstDate: firstBuy,
    tooShort,
  }
}
