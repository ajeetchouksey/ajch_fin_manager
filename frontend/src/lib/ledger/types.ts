import { moneyLocale } from './money'
import { privately } from './privacy'
/**
 * Ledger data contract v1 (ADR-001). The Ledger is a Google Sheet in the user's own Drive.
 * Column order is part of the contract — append new columns at the end only, and bump
 * CONTRACT_VERSION when the meaning of a column changes.
 */

export const CONTRACT_VERSION = '1'

export const TRANSACTION_COLUMNS = [
  'id',
  'date',
  'direction',
  'amount',
  'currency',
  'account',
  'category',
  'description',
  'notes',
  'tags',
  'document_ids',
  'source',
  'created_at',
  'account_id',
] as const

export const DOCUMENT_COLUMNS = [
  'id',
  'title',
  'type',
  'date',
  'notes',
  'tags',
  'transaction_ids',
  'file_name',
  'mime_type',
  'link',
  'uploaded_at',
] as const

export type Direction = 'out' | 'in'
export type TransactionSource = 'manual' | 'import'

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  direction: Direction
  amount: number // always positive; direction gives the sign
  currency: string
  account: string
  category: string
  description: string
  notes: string
  tags: string[]
  documentIds: string[]
  source: TransactionSource
  createdAt: string
  /** The account id this row belongs to (F01). Empty until the row is linked. */
  accountId?: string
  /** 1-based sheet row, for edits and deletes (not stored) */
  row?: number
}

export interface LedgerDocument {
  id: string // Drive file id
  title: string
  type: string
  date: string
  notes: string
  tags: string[]
  transactionIds: string[]
  fileName: string
  mimeType: string
  link: string
  uploadedAt: string
  row?: number
}

export interface LedgerLocation {
  folderId: string
  folderName: string
  folderLink: string
  documentsFolderId: string
  spreadsheetId: string
  spreadsheetLink: string
}

export const DOCUMENT_TYPES = [
  'Receipt',
  'Invoice',
  'Bank statement',
  'Payslip',
  'Contract',
  'Tax document',
  'Insurance',
  'Other',
]

export const INCOME_CATEGORIES = [
  'Salary',
  'Bonus',
  'Freelance & side income',
  'Interest & dividends',
  'Rental income',
  'Pension',
  'Child benefit',
  'Tax refund',
  'Refund',
  'Gift received',
  'Sale of items',
  'Other income',
]

/** Spending categories every user gets on top of the ones chosen during setup. */
export const MORE_EXPENSE_CATEGORIES = [
  'Mobile & internet',
  'Fitness',
  'Personal care',
  'Pets',
  'Taxes',
  'Fees & charges',
  'Loan & EMI',
  'Savings & investments',
  'Cash withdrawal',
]

const splitList = (s: unknown) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function newId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return `${prefix}_${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`.slice(0, 32)
}

export function transactionToRow(t: Transaction): (string | number)[] {
  return [
    t.id,
    t.date,
    t.direction,
    t.amount,
    t.currency,
    t.account,
    t.category,
    t.description,
    t.notes,
    t.tags.join(', '),
    t.documentIds.join(', '),
    t.source,
    t.createdAt,
    t.accountId ?? '',
  ]
}

export function rowToTransaction(r: unknown[], row: number): Transaction | null {
  const id = String(r[0] ?? '').trim()
  if (!id) return null
  const amount = Number(r[3])
  return {
    id,
    date: String(r[1] ?? ''),
    direction: r[2] === 'in' ? 'in' : 'out',
    amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
    currency: String(r[4] ?? ''),
    account: String(r[5] ?? ''),
    category: String(r[6] ?? ''),
    description: String(r[7] ?? ''),
    notes: String(r[8] ?? ''),
    tags: splitList(r[9]),
    documentIds: splitList(r[10]),
    source: r[11] === 'import' ? 'import' : 'manual',
    createdAt: String(r[12] ?? ''),
    accountId: String(r[13] ?? '').trim() || undefined,
    row,
  }
}

export function documentToRow(d: LedgerDocument): string[] {
  return [
    d.id,
    d.title,
    d.type,
    d.date,
    d.notes,
    d.tags.join(', '),
    d.transactionIds.join(', '),
    d.fileName,
    d.mimeType,
    d.link,
    d.uploadedAt,
  ]
}

export function rowToDocument(r: unknown[], row: number): LedgerDocument | null {
  const id = String(r[0] ?? '').trim()
  if (!id) return null
  return {
    id,
    title: String(r[1] ?? ''),
    type: String(r[2] ?? ''),
    date: String(r[3] ?? ''),
    notes: String(r[4] ?? ''),
    tags: splitList(r[5]),
    transactionIds: splitList(r[6]),
    fileName: String(r[7] ?? ''),
    mimeType: String(r[8] ?? ''),
    link: String(r[9] ?? ''),
    uploadedAt: String(r[10] ?? ''),
    row,
  }
}

/** Duplicate key used by bulk import. */
export function dedupeKey(t: Pick<Transaction, 'date' | 'amount' | 'direction' | 'description'>): string {
  return `${t.date}|${t.direction}|${t.amount.toFixed(2)}|${t.description.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

export function parseTags(s: string): string[] {
  return Array.from(new Set(splitList(s))).slice(0, 20)
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  DE: 'EUR', AT: 'EUR', NL: 'EUR', FR: 'EUR', IE: 'EUR', IN: 'INR', CH: 'CHF', GB: 'GBP', US: 'USD', AE: 'AED',
}

export const CURRENCIES = ['EUR', 'INR', 'USD', 'GBP', 'CHF', 'AED']

export function currencyForCountry(country?: string): string {
  return (country && CURRENCY_BY_COUNTRY[country]) || 'EUR'
}

export function formatMoney(amount: number, currency: string, direction?: Direction): string {
  let s: string
  try {
    s = new Intl.NumberFormat(moneyLocale(currency), { style: 'currency', currency: currency || 'EUR' }).format(amount)
  } catch {
    s = `${amount.toFixed(2)} ${currency}`
  }
  if (direction === 'out') return privately(`−${s}`)
  if (direction === 'in') return privately(`+${s}`)
  return privately(s)
}
