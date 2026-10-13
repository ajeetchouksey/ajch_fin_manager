/**
 * Bank-export friendly CSV parsing for bulk import.
 * Handles , ; and tab delimiters, quoted fields, German number format (1.234,56)
 * and common date formats (YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, MM/DD/YYYY).
 */

export type Delimiter = ',' | ';' | '\t'

export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n')
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of sample) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch as Delimiter]++
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Delimiter) || ','
}

export function parseCsv(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
  return rows
}

/** Parse "1.234,56", "1,234.56", "-12.5", "(12.50)", "12,50 €" → number, or null. */
export function parseAmount(raw: string): number | null {
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
  if (!s || !/\d/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    // decimal comma: 1.234,56
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // decimal dot: 1,234.56
    s = s.replace(/,/g, '')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

export type DateFormat = 'auto' | 'ymd' | 'dmy' | 'mdy'

const pad = (n: number) => String(n).padStart(2, '0')

function valid(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Returns YYYY-MM-DD or null. 'auto' treats a/b/c as day-first (European banks) unless impossible. */
export function parseDate(raw: string, format: DateFormat = 'auto'): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s)
  if (!m) return null
  const a = +m[1]
  const b = +m[2]
  const y = +m[3]
  if (format === 'mdy') return valid(y, a, b)
  if (format === 'dmy') return valid(y, b, a)
  if (format === 'ymd') return null
  return valid(y, b, a) ?? valid(y, a, b)
}

/** Guess which column holds what, from header names (English and German bank exports). */
export function guessColumns(header: string[]): { date?: number; amount?: number; description?: number; category?: number; notes?: number } {
  const find = (re: RegExp) => {
    const i = header.findIndex((h) => re.test(h.toLowerCase()))
    return i >= 0 ? i : undefined
  }
  return {
    date: find(/^(date|datum|buchungstag|buchungsdatum|booking date|transaction date|valuta|wertstellung)/),
    amount: find(/(amount|betrag|umsatz|value|summe)/),
    description: find(/(description|verwendungszweck|beschreibung|payee|empf|auftraggeber|merchant|details|text|name)/),
    category: find(/(category|kategorie)/),
    notes: find(/(note|notiz|memo|reference|referenz)/),
  }
}
