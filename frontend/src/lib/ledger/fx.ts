import { totalsFor, type Span } from './summary'
import type { Transaction } from './types'

/**
 * One exchange rate the user typed: 1 `base` = `rate` `quote` (for example 1 EUR = 90 INR). Every
 * transaction keeps its own currency; the rate only combines totals for the "Both" view.
 */
export interface ExchangeRate {
  base: string
  quote: string
  rate: number
}

export function validRate(fx: ExchangeRate | null | undefined): fx is ExchangeRate {
  return !!fx && !!fx.base && !!fx.quote && fx.base !== fx.quote && Number.isFinite(fx.rate) && fx.rate > 0
}

/** An amount in the base currency as seen in the quote currency. */
export const toQuote = (amountInBase: number, fx: ExchangeRate): number => amountInBase * fx.rate

/** An amount in the quote currency as seen in the base currency. */
export const quoteToBase = (amountInQuote: number, fx: ExchangeRate): number => amountInQuote / fx.rate

const r2 = (x: number) => Math.round(x * 100) / 100

/** Income and spending for a period with both currencies added together in the base currency. */
export function combinedTotals(tx: Transaction[], span: Span, fx: ExchangeRate) {
  const a = totalsFor(tx, span, fx.base)
  const b = totalsFor(tx, span, fx.quote)
  const income = r2(a.income + quoteToBase(b.income, fx))
  const spending = r2(a.spending + quoteToBase(b.spending, fx))
  return { income, spending, net: r2(income - spending), count: a.count + b.count }
}
