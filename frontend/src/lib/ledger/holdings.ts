/**
 * Holdings: what is held inside an investment or retirement account (a fund, a share, a coin), with the
 * quantity, what it cost on average and the latest price the person entered. Kept in the Holdings tab of the
 * Ledger (append new columns at the end only). FinBuddy does not fetch prices: the price is the person's, with its date.
 */

import { parseNumber } from './money'
import { newId } from './types'

export const HOLDING_COLUMNS = ['id', 'account_id', 'name', 'isin', 'symbol', 'asset_class', 'quantity', 'avg_cost', 'currency', 'price', 'price_date', 'notes', 'created_at'] as const

export const HOLDING_CLASSES = [
  { value: 'funds', label: 'Fund or ETF' },
  { value: 'shares', label: 'Share' },
  { value: 'gold', label: 'Gold or metal' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
] as const

export type HoldingClass = (typeof HOLDING_CLASSES)[number]['value']

export interface Holding {
  id: string
  accountId: string
  name: string
  /** 12 characters, validated; '' when unknown */
  isin: string
  symbol: string
  assetClass: HoldingClass
  /** Units held; fractions are normal */
  quantity: number
  /** Average cost per unit in `currency`; null when unknown */
  avgCost: number | null
  currency: string
  /** Latest price per unit that the person entered; null when none */
  price: number | null
  /** YYYY-MM-DD of that price, or '' */
  priceDate: string
  notes: string
  createdAt: string
  row?: number
}

export type HoldingDraft = Omit<Holding, 'id' | 'createdAt' | 'row'>

const str = (v: unknown) => String(v ?? '').trim()
const CLASSES = new Set<string>(HOLDING_CLASSES.map((c) => c.value))
const optional = (v: unknown): number | null => {
  if (str(v) === '') return null
  const n = parseNumber(v as string | number)
  return n !== null && Number.isFinite(n) && n >= 0 ? n : null
}
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : '')

export const newHoldingId = () => newId('hold')

/** An ISIN is two letters, nine letters or digits and a check digit; the check digit is verified. */
export function isIsin(value: string): boolean {
  const v = value.trim().toUpperCase()
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v)) return false
  const digits = [...v.slice(0, 11)].map((c) => (c >= 'A' ? String(c.charCodeAt(0) - 55) : c)).join('')
  let sum = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return (10 - (sum % 10)) % 10 === Number(v[11])
}

export function holdingToRow(h: Holding): (string | number)[] {
  return [h.id, h.accountId, h.name, h.isin, h.symbol, h.assetClass, h.quantity, h.avgCost ?? '', h.currency, h.price ?? '', h.priceDate, h.notes, h.createdAt]
}

export function rowToHolding(r: unknown[], row: number): Holding | null {
  const id = str(r[0])
  if (!id) return null
  const quantity = parseNumber(r[6] as string | number)
  const assetClass = str(r[5])
  return {
    id,
    accountId: str(r[1]),
    name: str(r[2]) || 'Holding',
    isin: str(r[3]).toUpperCase(),
    symbol: str(r[4]),
    assetClass: CLASSES.has(assetClass) ? (assetClass as HoldingClass) : 'other',
    quantity: quantity !== null && Number.isFinite(quantity) ? Math.abs(quantity) : 0,
    avgCost: optional(r[7]),
    currency: str(r[8]) || 'EUR',
    price: optional(r[9]),
    priceDate: date(r[10]),
    notes: str(r[11]),
    createdAt: str(r[12]),
    row,
  }
}

/** Quantity times the latest price; null when there is no price. */
export const holdingValue = (h: Pick<Holding, 'quantity' | 'price'>): number | null => (h.price === null ? null : Math.round(h.quantity * h.price * 100) / 100)

/** Quantity times the average cost; null when the cost is unknown. */
export const holdingCost = (h: Pick<Holding, 'quantity' | 'avgCost'>): number | null => (h.avgCost === null ? null : Math.round(h.quantity * h.avgCost * 100) / 100)

/** Value less cost, and as a share of the cost; null unless both are known and the cost is above zero. */
export function holdingGain(h: Pick<Holding, 'quantity' | 'price' | 'avgCost'>): { amount: number; share: number } | null {
  const value = holdingValue(h)
  const cost = holdingCost(h)
  if (value === null || cost === null || cost <= 0) return null
  return { amount: Math.round((value - cost) * 100) / 100, share: Math.round(((value - cost) / cost) * 10000) / 10000 }
}

export interface AccountHoldings {
  accountId: string
  /** Sum of the priced holdings (those in the account's currency) */
  value: number
  /** How many holdings have no price, so are not in `value` */
  unpriced: number
  count: number
}

/** The holdings of each account added up. Holdings in another currency than the account are counted but not added to the value. */
export function holdingsByAccount(holdings: Holding[], accountCurrency: (accountId: string) => string | undefined): Map<string, AccountHoldings> {
  const out = new Map<string, AccountHoldings>()
  for (const h of holdings) {
    const e = out.get(h.accountId) ?? { accountId: h.accountId, value: 0, unpriced: 0, count: 0 }
    e.count++
    const v = holdingValue(h)
    if (v === null || h.currency !== accountCurrency(h.accountId)) e.unpriced++
    else e.value = Math.round((e.value + v) * 100) / 100
    out.set(h.accountId, e)
  }
  return out
}

/** Why a holding cannot be saved yet, or null. */
export function holdingProblem(d: Pick<HoldingDraft, 'accountId' | 'name' | 'isin' | 'quantity' | 'avgCost' | 'price'>): string | null {
  if (!d.accountId) return 'Pick the account this is held in.'
  if (!d.name.trim()) return 'Give the holding a name.'
  if (d.isin && !isIsin(d.isin)) return 'The ISIN does not look right (12 characters, for example IE00B4L5Y983). Leave it empty if unsure.'
  if (!(d.quantity > 0)) return 'Enter how many units you hold.'
  if (d.avgCost !== null && d.avgCost < 0) return 'The average cost cannot be negative.'
  if (d.price !== null && d.price < 0) return 'The price cannot be negative.'
  return null
}
