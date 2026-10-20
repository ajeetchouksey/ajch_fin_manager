/**
 * One standard for money numbers in FinBuddy.
 *
 * Shown: each currency has one fixed convention, not the browser's. So the same amount looks the same on every device.
 * Typed or imported: both "1.234,56" (German) and "1,234.56" (English) are read. A single separator followed by
 * exactly three digits is read as a thousands separator, because money is almost never written to three decimals.
 */

/** The locale a currency is shown in. Change it here only. */
export function moneyLocale(currency: string): string {
  const c = (currency || 'EUR').toUpperCase()
  if (c === 'EUR') return 'de-DE' // 1.234,56 €
  if (c === 'INR') return 'en-IN' // ₹1,23,456.78
  return 'en-US' // 1,234.56 USD
}

/**
 * Reads a number typed or imported in either convention. Returns null when there is no number.
 * Handles "(12.50)" as negative, a leading minus or plus, and currency symbols or spaces.
 */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw ?? '').trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[^\d,.\-+]/g, '')
  if (s.startsWith('-')) negative = !negative
  s = s.replace(/[+-]/g, '')
  if (!/\d/.test(s)) return null

  const commas = (s.match(/,/g) ?? []).length
  const dots = (s.match(/\./g) ?? []).length
  let normalised: string
  if (commas && dots) {
    // Both present: the one that comes last is the decimal separator
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    normalised = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (commas || dots) {
    const sep = commas ? ',' : '.'
    const count = commas || dots
    const after = s.length - s.lastIndexOf(sep) - 1
    // Repeated separator, or exactly three digits after one: thousands. Otherwise: decimal.
    const thousands = count > 1 || after === 3
    normalised = thousands ? s.split(sep).join('') : s.replace(sep, '.')
  } else {
    normalised = s
  }
  const n = Number(normalised)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** A plain number in the currency's convention, with no symbol, e.g. "1.234,56" or "1,234.56". */
export function formatNumber(n: number, currency: string, fractionDigits = 2): string {
  return new Intl.NumberFormat(moneyLocale(currency), { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(n)
}
