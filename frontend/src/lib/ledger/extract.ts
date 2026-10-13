/**
 * On-device extraction of transactions from PDFs and images.
 * Everything runs in the browser: digital PDFs are read with pdf.js, photos and scans with
 * tesseract.js (self-hosted under /ocr). No file content is sent anywhere.
 */
import { parseAmount } from './csv'

export interface ExtractProgress {
  status: string
  /** 0..1, when known */
  progress?: number
}

export interface ExtractedText {
  method: 'pdf-text' | 'ocr'
  lines: string[]
}

/** A statement row; amount is signed (negative = money out). */
export interface ExtractedRow {
  date: string
  description: string
  amount: number
}

export interface ReceiptFields {
  date?: string
  amount?: number
  merchant?: string
  currency?: string
}

export const EXTRACTABLE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const EXTRACTABLE_ACCEPT = '.pdf,application/pdf,image/png,image/jpeg,image/webp'
export const isExtractable = (f: File) => EXTRACTABLE_TYPES.includes(f.type) || /\.pdf$/i.test(f.name)

const MAX_OCR_PAGES = 5
type Progress = (p: ExtractProgress) => void

// ---------- reading ----------

/** Reads the text lines of a PDF or image. Scanned PDFs fall back to OCR. */
export async function readFileText(file: File, onProgress?: Progress): Promise<ExtractedText> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return readPdf(file, onProgress)
  if (file.type.startsWith('image/')) return { method: 'ocr', lines: await ocr([file], onProgress) }
  throw new Error('Choose a PDF or an image (PNG, JPEG or WebP).')
}

async function readPdf(file: File, onProgress?: Progress): Promise<ExtractedText> {
  onProgress?.({ status: 'Opening PDF' })
  // Legacy build: it carries polyfills for newer JS methods (e.g. Map.getOrInsertComputed) that many browsers lack
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  } catch (e) {
    if ((e as Error)?.name === 'PasswordException') throw new Error('This PDF is password protected. Save an unprotected copy and try again.')
    throw new Error('This PDF could not be opened.')
  }
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.({ status: `Reading page ${p} of ${doc.numPages}`, progress: p / doc.numPages })
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    lines.push(...textItemsToLines(content.items as unknown as PdfTextItem[]))
  }
  const chars = lines.join('').replace(/\s/g, '').length
  if (chars >= 40 * doc.numPages) return { method: 'pdf-text', lines }

  // No text layer: a scan. Render pages and OCR them.
  const canvases: HTMLCanvasElement[] = []
  for (let p = 1; p <= Math.min(doc.numPages, MAX_OCR_PAGES); p++) {
    onProgress?.({ status: `Preparing scanned page ${p}` })
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    canvases.push(canvas)
  }
  return { method: 'ocr', lines: await ocr(canvases, onProgress) }
}

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

/** Groups pdf.js text items into visual lines; wide horizontal gaps become two spaces (column breaks). */
export function textItemsToLines(items: PdfTextItem[]): string[] {
  const rows: Array<{ y: number; items: PdfTextItem[] }> = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5]
    const tolerance = Math.max(2, (it.height || 10) * 0.4)
    const row = rows.find((r) => Math.abs(r.y - y) <= tolerance)
    if (row) row.items.push(it)
    else rows.push({ y, items: [it] })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => {
    const sorted = r.items.sort((a, b) => a.transform[4] - b.transform[4])
    let out = ''
    let end = -Infinity
    for (const it of sorted) {
      const x = it.transform[4]
      if (out) out += x - end > Math.max(4, (it.height || 10) * 0.8) ? '  ' : x - end > 0.5 ? ' ' : ''
      out += it.str
      end = x + it.width
    }
    return out.replace(/[ \t]{3,}/g, '  ').trim()
  })
}

async function ocr(images: Array<File | HTMLCanvasElement>, onProgress?: Progress): Promise<string[]> {
  onProgress?.({ status: 'Loading text recognition (first time only)' })
  const { createWorker, OEM } = await import('tesseract.js')
  const base = new URL('/ocr/', window.location.href).href
  let page = 0
  const worker = await createWorker(['eng', 'deu'], OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        const label = images.length > 1 ? `Reading text (page ${page} of ${images.length})` : 'Reading text'
        onProgress?.({ status: label, progress: m.progress })
      } else if (m.status.startsWith('loading')) onProgress?.({ status: 'Loading text recognition (first time only)', progress: m.progress })
    },
  })
  try {
    const lines: string[] = []
    for (const img of images) {
      page++
      const { data } = await worker.recognize(img)
      lines.push(...data.text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean))
    }
    return lines
  } finally {
    await worker.terminate()
  }
}

// ---------- dates and amounts ----------

const MONTHS: Record<string, number> = {
  jan: 1, januar: 1, january: 1, feb: 2, februar: 2, february: 2, mar: 3, mär: 3, maerz: 3, märz: 3, march: 3,
  apr: 4, april: 4, may: 5, mai: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, okt: 10, oktober: 10, october: 10, nov: 11, november: 11, dec: 12, dez: 12, dezember: 12, december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

export interface FoundDate {
  iso: string
  index: number
  length: number
  hasYear: boolean
}

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpExecArray, year: number) => string | null; hasYear: boolean }> = [
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, parse: (m) => iso(+m[1], +m[2], +m[3]), hasYear: true },
  // Day first (European / Indian), falling back to month first when day-first is impossible
  { re: /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g, parse: (m) => iso(+m[3], +m[2], +m[1]) ?? iso(+m[3], +m[1], +m[2]), hasYear: true },
  { re: new RegExp(`\\b(\\d{1,2})\\.?\\s?(${MONTH_NAMES})\\.?,?\\s?(\\d{4}|\\d{2})?\\b`, 'gi'), parse: (m, y) => iso(m[3] ? +m[3] : y, MONTHS[m[2].toLowerCase()], +m[1]), hasYear: false },
  { re: new RegExp(`\\b(${MONTH_NAMES})\\.?\\s(\\d{1,2}),?\\s?(\\d{4})?\\b`, 'gi'), parse: (m, y) => iso(m[3] ? +m[3] : y, MONTHS[m[1].toLowerCase()], +m[2]), hasYear: false },
  // German statements often print "01.10." without a year
  { re: /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(?!\d)/g, parse: (m, y) => iso(y, +m[2], +m[1]), hasYear: false },
]

/** Finds all dates in a line, left to right. Dates without a year use yearHint. */
export function findDates(line: string, yearHint: number): FoundDate[] {
  const found: FoundDate[] = []
  for (const p of DATE_PATTERNS) {
    p.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = p.re.exec(line))) {
      const start = m.index
      const end = start + m[0].length
      if (found.some((f) => start < f.index + f.length && end > f.index)) continue
      const value = p.parse(m, yearHint)
      // A month-name match carries a year only if the year group matched
      const hasYear = p.hasYear || /\d{4}|\s\d{2}$/.test(m[0].replace(/^\d{1,2}/, ''))
      if (value) found.push({ iso: value, index: start, length: m[0].length, hasYear })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}

export interface FoundAmount {
  value: number
  /** true when the text itself marks the sign (minus, trailing minus, S/H, Dr/Cr) */
  signed: boolean
  index: number
  length: number
}

const AMOUNT_RE = /([-−–+]\s?)?(?:[€$£₹]\s?)?(\d{1,3}(?:[.,'’ ]\d{3})+|\d+)([.,])(\d{2})(?!\d)(\s?-(?![\d]))?(\s?(?:EUR|INR|USD|GBP|CHF|AED|€|\$|£|₹))?(\s?(?:S|H|Dr|DR|Cr|CR)\b)?/g

/** Finds money amounts (with exactly two decimals) in a line. */
export function findAmounts(line: string): FoundAmount[] {
  const out: FoundAmount[] = []
  AMOUNT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = AMOUNT_RE.exec(line))) {
    // Skip things that are clearly part of a date (12.10.2026) or an IBAN/long number
    const before = line[m.index - 1]
    const after = line[m.index + m[0].length]
    if ((before && /[\d.]/.test(before)) || (after && /[\d.]/.test(after))) continue
    const intPart = m[2].replace(/[.,'’ ]/g, '')
    const value = parseAmount(`${intPart}.${m[4]}`)
    if (value === null) continue
    const marker = (m[7] ?? '').trim().toUpperCase()
    const negative = Boolean(m[1] && /[-−–]/.test(m[1])) || Boolean(m[5]) || marker === 'S' || marker === 'DR'
    const signed = negative || Boolean(m[1]) || marker === 'H' || marker === 'CR'
    out.push({ value: negative ? -value : value, signed, index: m.index, length: m[0].length })
  }
  return out
}

/** Most common 4-digit year in the text, used for dates printed without a year. */
export function guessYear(lines: string[]): number {
  const counts = new Map<number, number>()
  for (const l of lines) for (const m of l.matchAll(/\b(19[9]\d|20\d{2})\b/g)) counts.set(+m[1], (counts.get(+m[1]) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : new Date().getFullYear()
}

// ---------- bank statements ----------

const BALANCE_LINE = /(saldo|kontostand|balance|übertrag|uebertrag|carried forward|brought forward|opening|closing|anfangs|end(?:e)?saldo|neuer saldo|alter saldo)/i
const NOISE_LINE = /(seite \d|page \d|iban|bic|kontonummer|account number|auszug|statement period|blz|datum\s+.*betrag|date\s+.*amount|buchungstag|wert(?:stellung)?\s|description|beschreibung)/i

/**
 * Turns statement text lines into transactions. A row starts with a date and contains an amount.
 * With two or more amounts on a row, the last is taken as the running balance; balance changes
 * then decide money in/out when the statement prints debits and credits in separate columns.
 */
export function parseStatement(lines: string[]): ExtractedRow[] {
  const year = guessYear(lines)
  const rows: Array<ExtractedRow & { signed: boolean; balance?: number; extra: number }> = []
  let prevBalance: number | undefined

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const dates = findDates(line, year)
    const amounts = findAmounts(line).filter((a) => !dates.some((d) => a.index < d.index + d.length && a.index + a.length > d.index))
    const startsWithDate = dates.length > 0 && dates[0].index <= 3

    if (BALANCE_LINE.test(line) && amounts.length) {
      prevBalance = amounts[amounts.length - 1].value
      continue
    }
    if (!startsWithDate || !amounts.length) {
      // Continuation of the previous row's description (multi-line purpose text)
      const last = rows[rows.length - 1]
      if (last && !startsWithDate && !amounts.length && last.extra < 2 && line.length <= 90 && !NOISE_LINE.test(line) && /[a-zA-ZäöüÄÖÜ]{2,}/.test(line)) {
        last.description = `${last.description} ${line}`.slice(0, 200)
        last.extra++
      }
      continue
    }

    const amount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0]
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1].value : undefined
    let value = amount.value
    let signed = amount.signed
    if (balance !== undefined && prevBalance !== undefined) {
      const diff = Math.round((balance - prevBalance) * 100) / 100
      if (Math.abs(Math.abs(diff) - Math.abs(value)) < 0.005) {
        value = diff
        signed = true
      }
    }
    if (balance !== undefined) prevBalance = balance

    // Description: the line without its dates and amounts
    const cut = [...dates, ...amounts].sort((a, b) => b.index - a.index)
    let description = line
    for (const c of cut) description = description.slice(0, c.index) + ' ' + description.slice(c.index + c.length)
    description = description.replace(/\s+/g, ' ').replace(/^[\s|:;,-]+|[\s|:;,-]+$/g, '').trim()

    if (Math.abs(value) < 0.005) continue
    rows.push({ date: dates[0].iso, description: description.slice(0, 200), amount: value, signed, balance, extra: 0 })
  }

  // If the statement never marks a sign and never lets us infer one, amounts are all positive:
  // leave them so; the import screen lets the user say whether they are money out or in.
  return rows.map(({ date, description, amount }) => ({ date, description: description || '(no description)', amount }))
}

/** A balance printed on a statement: what the account held at the end of a day. */
export interface StatementBalance {
  balance: number
  /** YYYY-MM-DD, when the statement says which day */
  date?: string
}

const CLOSING_LINE = /(closing|end(?:e)?saldo|neuer saldo|kontostand|available balance|current balance|balance as (?:on|of|at)|saldo (?:am|per|zum)|carried forward)/i

/**
 * The statement's closing balance: a "closing balance" / "Neuer Saldo" line, otherwise the running
 * balance after the latest transaction. Undefined when the statement prints neither.
 */
export function parseStatementBalance(lines: string[]): StatementBalance | undefined {
  const year = guessYear(lines)
  let closing: StatementBalance | undefined
  const running: Array<{ date: string; balance: number }> = []

  for (const raw of lines) {
    const line = raw.trim()
    const dates = findDates(line, year)
    const amounts = findAmounts(line).filter((a) => !dates.some((d) => a.index < d.index + d.length && a.index + a.length > d.index))
    if (!amounts.length) continue
    if (CLOSING_LINE.test(line)) {
      closing = { balance: amounts[amounts.length - 1].value, date: dates[dates.length - 1]?.iso }
      continue
    }
    if (dates.length && dates[0].index <= 3 && amounts.length >= 2 && !BALANCE_LINE.test(line)) {
      running.push({ date: dates[0].iso, balance: amounts[amounts.length - 1].value })
    }
  }

  const latestDate = running.reduce<string | undefined>((d, r) => (!d || r.date > d ? r.date : d), undefined)
  if (closing) return { balance: closing.balance, date: closing.date ?? latestDate }
  if (!running.length) return undefined
  // Newest first or oldest first: the latest row is at whichever end carries the latest date
  const newestFirst = running[0].date > running[running.length - 1].date
  const last = newestFirst ? running.find((r) => r.date === latestDate)! : [...running].reverse().find((r) => r.date === latestDate)!
  return { balance: last.balance, date: last.date }
}

/** CSV text (Date, Description, Amount) for the import screen, so extracted rows can be checked and edited. */
export function rowsToCsv(rows: ExtractedRow[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return ['Date,Description,Amount', ...rows.map((r) => `${r.date},${q(r.description)},${r.amount.toFixed(2)}`)].join('\n')
}

// ---------- receipts ----------

const TOTAL_STRONG = /(grand total|total|amount due|to pay|summe|gesamtbetrag|gesamt|zu zahlen|endbetrag|rechnungsbetrag|net payable|amount payable)/i
const TOTAL_WEAK = /(betrag|bar|ec-?karte|kartenzahlung|girocard|visa|mastercard|card|paid)/i
const NOT_TOTAL = /(sub-?total|zwischensumme|mwst|ust|vat|tax|steuer|netto|net\b|rückgeld|rueckgeld|change|gegeben|tip|trinkgeld|discount|rabatt)/i
const NOT_MERCHANT = /(receipt|beleg|rechnung|invoice|kassenbon|quittung|tel|fax|www\.|http|@|str\.|straße|strasse|ust|steuer|datum|date|uhr|kasse|bon\b|\d{5})/i

export function detectCurrency(text: string): string | undefined {
  if (/€|\bEUR\b/i.test(text)) return 'EUR'
  if (/₹|\bINR\b|\bRs\.?\s?\d/i.test(text)) return 'INR'
  if (/£|\bGBP\b/i.test(text)) return 'GBP'
  if (/\bCHF\b/i.test(text)) return 'CHF'
  if (/\bAED\b|د\.إ/i.test(text)) return 'AED'
  if (/\$|\bUSD\b/i.test(text)) return 'USD'
  return undefined
}

/** Picks date, total, merchant and currency from receipt or invoice text. */
export function parseReceipt(lines: string[]): ReceiptFields {
  const year = guessYear(lines)
  const result: ReceiptFields = {}

  for (const l of lines) {
    const d = findDates(l, year).find((x) => x.hasYear)
    if (d) {
      result.date = d.iso
      break
    }
  }

  const amountOn = (i: number): number | undefined => {
    const own = findAmounts(lines[i])
    if (own.length) return Math.abs(own[own.length - 1].value)
    const next = lines[i + 1] ? findAmounts(lines[i + 1]) : []
    return next.length && !TOTAL_STRONG.test(lines[i + 1]) ? Math.abs(next[0].value) : undefined
  }
  const candidates = (re: RegExp) =>
    lines
      .map((l, i) => (re.test(l) && !NOT_TOTAL.test(l) ? amountOn(i) : undefined))
      .filter((v): v is number => v !== undefined && v > 0)
  const strong = candidates(TOTAL_STRONG)
  const weak = candidates(TOTAL_WEAK)
  if (strong.length) result.amount = Math.max(...strong)
  else if (weak.length) result.amount = Math.max(...weak)
  else {
    const all = lines.flatMap((l) => (NOT_TOTAL.test(l) ? [] : findAmounts(l).map((a) => Math.abs(a.value))))
    if (all.length) result.amount = Math.max(...all)
  }

  const merchant = lines.slice(0, 6).find((l) => {
    const letters = (l.match(/[a-zA-ZäöüÄÖÜß]/g) ?? []).length
    return letters >= 3 && letters >= l.replace(/\s/g, '').length * 0.6 && !NOT_MERCHANT.test(l)
  })
  if (merchant) result.merchant = merchant.replace(/\s+/g, ' ').trim().slice(0, 80)

  result.currency = detectCurrency(lines.join('\n'))
  return result
}
