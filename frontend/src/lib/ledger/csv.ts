import { parseNumber } from './money'
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

/** Parse "1.234,56", "1,234.56", "-12.5", "(12.50)", "12,50 €" → number, or null. Rules live in money.ts. */
export const parseAmount = parseNumber

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

/** What each column holds. `amount` is the signed amount, or the money-out column when `credit` is set. */
export interface ColumnMap {
  date?: number
  amount?: number
  /** Separate money-in column (banks that split Soll/Haben, Debit/Credit, Withdrawal/Deposit) */
  credit?: number
  description?: number
  /** Who paid or was paid; joined with the description */
  payee?: number
  /** Recipient column when the bank lists payer and recipient separately (DKB); used for money out */
  recipient?: number
  category?: number
  notes?: number
  currency?: number
  /** Booking type such as "Lastschrift" or "Gehalt/Rente"; only used to suggest a category */
  kind?: number
}

export interface TableAnalysis {
  /** Index of the header row, or -1 when there is none */
  headerRow: number
  /** First data row */
  firstRow: number
  map: ColumnMap
  /** Currency taken from a header like "Betrag (€)" when there is no currency column */
  currency?: string
  /** Name of the bank format, when recognised */
  bank?: string
}

const H = {
  date: /^(buchungstag|buchungsdatum|buchung$|datum|date|transaction date|txn date|booking date|posting date|tran date)/,
  valueDate: /(wertstellung|valuta|value date|valutadatum)/,
  amount: /(^betrag|amount|^umsatz$|^umsatz in|^summe|^value$|transaction amount)/,
  debit: /(^soll$|^soll |debit|withdrawal|ausgang|belastung|money out|paid out|^dr\.?$|^out$)/,
  credit: /(^haben$|^haben |credit|deposit|eingang|money in|paid in|^cr\.?$|^in$)/,
  payee: /(auftraggeber$|auftraggeber\/|empfänger|empfaenger|zahlungsempf|zahlungspflicht|beguenstigter|begünstigter|payee|merchant|counterparty|gegenpartei|^name|partner)/,
  purpose: /(verwendungszweck|narration|particulars|description|beschreibung|remarks|payment reference|memo|details)/,
  text: /(buchungstext|^text$)/,
  kind: /(umsatzart|umsatztyp|transaction type|buchungsart|^type$|^typ$)/,
  category: /^(kategorie|category)/,
  currency: /^(währung|waehrung|whrg|currency|curr\.?$|ccy)/,
  notes: /(^notiz|^note|^notes$)/,
  never: /(iban|bic|blz|bankleitzahl|kontonummer|konto$|kontostand|saldo|balance|mandat|gläubiger|glaeubiger|creditor id|kundenreferenz|reference no|ref\.? no|chq|cheque|status)/,
}

const MONEY = /^[+\-−]?\s*\(?\s*(?:[A-Z]{3}|[€$£₹])?\s*[+\-−]?\s*\d{1,3}(?:[.,'\s]?\d{3})*(?:[.,]\d{1,2})?\s*(?:[A-Z]{3}|[€$£₹])?\s*\)?\s*[+\-−]?$|^[+\-−]?\d+(?:[.,]\d{1,2})?$/

const isMoney = (c: string) => MONEY.test(c.trim()) && !parseDate(c)

const CURRENCY_SYMBOL: Array<[RegExp, string]> = [
  [/€|\beur\b/i, 'EUR'],
  [/₹|\binr\b|\brs\.?\b/i, 'INR'],
  [/£|\bgbp\b/i, 'GBP'],
  [/\$|\busd\b/i, 'USD'],
  [/\bchf\b/i, 'CHF'],
]

function headerScore(row: string[]): number {
  let score = 0
  for (const raw of row) {
    const h = raw.toLowerCase().trim()
    if (!h || h.length > 60) continue
    if (H.date.test(h) || H.valueDate.test(h)) score += 2
    else if (H.amount.test(h) || H.debit.test(h) || H.credit.test(h)) score += 2
    else if ([H.payee, H.purpose, H.text, H.kind, H.category, H.currency].some((re) => re.test(h))) score += 1
  }
  return score
}

/**
 * Reads a bank export the way a person would: skips the account summary some banks put above the
 * table (DKB, ING …), finds the header, then picks columns by name and by what is actually in
 * them, so "Umsatzart" or "Saldo" is never taken for the amount.
 */
export function analyzeTable(table: string[][]): TableAnalysis {
  const width = Math.max(0, ...table.map((r) => r.length))
  // 1. Header row: the best-scoring row near the top
  let headerRow = -1
  let best = 2
  for (let i = 0; i < Math.min(40, table.length - 1); i++) {
    const s = headerScore(table[i])
    if (s > best && table[i].length >= 3) {
      best = s
      headerRow = i
    }
  }
  const header = headerRow >= 0 ? table[headerRow].map((h) => h.toLowerCase().trim()) : []
  const cols = headerRow >= 0 ? header.length : width
  let firstRow = headerRow + 1
  if (headerRow < 0) {
    // No header: skip leading lines until rows start to look like transactions
    firstRow = Math.max(0, table.findIndex((r) => r.length >= 3 && r.some((c) => parseDate(c)) && r.some(isMoney)))
  }
  const sample = table.slice(firstRow, firstRow + 80).filter((r) => r.length >= Math.min(3, cols))

  // 2. What each column contains
  const stats = Array.from({ length: cols }, (_, i) => {
    const vals = sample.map((r) => (r[i] ?? '').trim())
    const filled = vals.filter(Boolean)
    const n = filled.length || 1
    return {
      fill: filled.length / (sample.length || 1),
      date: filled.filter((v) => parseDate(v)).length / n,
      money: filled.filter(isMoney).length / n,
      negative: filled.some((v) => /^[-−]|^\(|[-−]$/.test(v.trim())),
      textLen: filled.reduce((a, v) => a + (/[a-zA-ZäöüÄÖÜ]{3}/.test(v) ? v.length : 0), 0) / n,
      code: filled.length > 0 && filled.every((v) => /^[A-Z]{3}$/.test(v)),
    }
  })

  const used = new Set<number>()
  const pick = (test: (i: number) => boolean): number | undefined => {
    for (let i = 0; i < cols; i++) {
      if (used.has(i) || !test(i)) continue
      used.add(i)
      return i
    }
    return undefined
  }
  const named = (re: RegExp) => (i: number) => !!header[i] && re.test(header[i]) && !H.never.test(header[i])

  const map: ColumnMap = {}
  map.date =
    pick((i) => named(H.date)(i) && stats[i].date >= 0.6) ??
    pick((i) => named(H.valueDate)(i) && stats[i].date >= 0.6) ??
    pick((i) => stats[i].date >= 0.8)

  // 3. Amount: one signed column, or separate out and in columns
  const isDebit = (i: number) => named(H.debit)(i) && stats[i].money >= 0.6
  const isCredit = (i: number) => named(H.credit)(i) && stats[i].money >= 0.6
  const debit = header.findIndex((_, i) => !used.has(i) && isDebit(i))
  const credit = header.findIndex((_, i) => !used.has(i) && i !== debit && isCredit(i))
  const signed = pick((i) => named(H.amount)(i) && !isDebit(i) && !isCredit(i) && stats[i].money >= 0.6)
  if (debit >= 0 && credit >= 0 && (signed === undefined || !stats[signed].negative)) {
    if (signed !== undefined) used.delete(signed)
    map.amount = debit
    map.credit = credit
    used.add(debit)
    used.add(credit)
  } else {
    map.amount = signed ?? pick((i) => stats[i].money >= 0.8 && stats[i].fill >= 0.8 && stats[i].textLen === 0)
  }

  // 4. Text columns
  map.currency = pick((i) => (named(H.currency)(i) || !header.length) && stats[i].code)
  map.kind = pick(named(H.kind))
  map.category = pick(named(H.category))
  map.payee = pick((i) => named(H.payee)(i) && stats[i].textLen > 0)
  const second = pick((i) => named(H.payee)(i) && stats[i].textLen > 0)
  if (map.payee !== undefined && second !== undefined) {
    // Payer and recipient in separate columns: the counterparty depends on the direction
    const isRecipient = (i: number) => /(empf|recipient|beneficiary|begünstigt|beguenstigt)/.test(header[i])
    if (isRecipient(map.payee) && !isRecipient(second)) [map.payee, map.recipient] = [second, map.payee]
    else map.recipient = second
  }
  map.description = pick((i) => named(H.purpose)(i) && stats[i].textLen > 0) ?? pick((i) => named(H.text)(i) && stats[i].textLen > 0)
  if (map.description === undefined && map.payee !== undefined) {
    map.description = map.payee
    map.payee = undefined
  }
  if (map.description === undefined) {
    let longest = -1
    for (let i = 0; i < cols; i++) if (!used.has(i) && stats[i].textLen > (longest >= 0 ? stats[longest].textLen : 0)) longest = i
    if (longest >= 0) {
      map.description = longest
      used.add(longest)
    }
  }
  // Booking text such as Sparkasse "Buchungstext" ("LOHN GEHALT") still helps categorise
  if (map.kind === undefined) map.kind = pick(named(H.text))
  map.notes = pick(named(H.notes))

  let currency: string | undefined
  const amountHeader = map.amount !== undefined && headerRow >= 0 ? table[headerRow][map.amount] ?? '' : ''
  for (const [re, code] of CURRENCY_SYMBOL) if (!currency && re.test(amountHeader)) currency = code

  return { headerRow, firstRow, map, currency, bank: detectBank(header) }
}

const BALANCE_HEADER = /(saldo|kontostand|balance)/

/**
 * The account balance a bank export states: the running balance column after the latest row
 * (ING "Saldo", HDFC "Closing Balance"), or a summary line above the table such as DKB's
 * "Kontostand vom 12.10.2026: 1.234,56 €". Undefined when the export has neither.
 */
export function findCsvBalance(table: string[][], analysis: TableAnalysis): { balance: number; date?: string } | undefined {
  const { headerRow, firstRow, map } = analysis
  const header = headerRow >= 0 ? table[headerRow].map((h) => h.toLowerCase().trim()) : []
  const col = header.findIndex((h) => BALANCE_HEADER.test(h) && !/(opening|anfang|alt)/.test(h))
  if (col >= 0 && map.date !== undefined) {
    const rows = table
      .slice(firstRow)
      .map((r) => ({ date: parseDate(r[map.date!] ?? ''), balance: parseAmount(r[col] ?? '') }))
      .filter((r): r is { date: string; balance: number } => !!r.date && r.balance !== null)
    if (rows.length) {
      const latest = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0].date)
      // On the latest day, the newest row is the last one in an oldest-first export, the first otherwise
      const newestFirst = rows[0].date > rows[rows.length - 1].date
      return (newestFirst ? rows : [...rows].reverse()).find((r) => r.date === latest)
    }
  }
  for (const row of table.slice(0, Math.max(0, headerRow))) {
    const label = row.find((c) => BALANCE_HEADER.test(c.toLowerCase()))
    const money = row.filter((c) => c !== label && isMoney(c))
    if (!label || !money.length) continue
    const balance = parseAmount(money[money.length - 1])
    if (balance === null) continue
    const dateText = row.map((c) => /\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/.exec(c)?.[0]).find(Boolean)
    return { balance, date: (dateText && parseDate(dateText)) || undefined }
  }
  return undefined
}

function detectBank(header: string[]): string | undefined {
  const h = header.join('|')
  if (/buchungstag\|wertstellung\|umsatzart\|buchungstext\|betrag/.test(h)) return 'Commerzbank'
  if (/beguenstigter\/zahlungspflichtiger/.test(h)) return 'Sparkasse'
  if (/zahlungspflichtige\*r|zahlungsempfänger\*in/.test(h)) return 'DKB'
  if (/auftraggeber\/empfänger/.test(h) && /saldo/.test(h)) return 'ING'
  if (/payee/.test(h) && /payment reference/.test(h)) return 'N26'
  if (/narration/.test(h) && /withdrawal/.test(h)) return 'HDFC Bank'
  return undefined
}

/** Quick check that a CSV is a bank statement, and how many transactions it holds. */
export function looksLikeStatement(text: string): { rows: number; bank?: string } | null {
  const table = parseCsv(text)
  if (table.length < 2) return null
  const { map, firstRow, bank } = analyzeTable(table)
  if (map.date === undefined || map.amount === undefined) return null
  const amountOf = (r: string[]) => parseAmount(r[map.amount!] ?? '') ?? (map.credit !== undefined ? parseAmount(r[map.credit] ?? '') : null)
  const rows = table.slice(firstRow).filter((r) => parseDate(r[map.date!] ?? '') && amountOf(r) !== null).length
  return rows ? { rows, bank } : null
}

/** Reads a CSV file, falling back to Windows-1252 for older German bank exports. */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(buf)
  return text.includes('�') ? new TextDecoder('windows-1252').decode(buf) : text
}

export const isCsvFile = (f: File) => /\.(csv|tsv|txt)$/i.test(f.name) || f.type === 'text/csv'
