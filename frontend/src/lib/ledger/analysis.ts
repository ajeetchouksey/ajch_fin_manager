/**
 * AI analysis entries (see docs/ai-analysis-spec.md): the Analysis tab's shape, how each figure an AI cites
 * is checked against the user's own ledger, and whether an entry may be out of date.
 */
import { spendingByCategory, totalsFor, type Span } from './summary'
import type { Transaction } from './types'

export const ANALYSIS_COLUMNS = [
  'id',
  'kind',
  'title',
  'body',
  'period_start',
  'period_end',
  'figures',
  'verified',
  'status',
  'written_by',
  'created_at',
  'ledger_as_of',
] as const

export const ANALYSIS_KINDS = ['analysis', 'recommendation', 'projection', 'data_issue', 'categorisation'] as const
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number]
export const ANALYSIS_STATUSES = ['open', 'done', 'dismissed'] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]
export type Verified = 'yes' | 'no' | 'not_checked'

/** A figure an AI cites. Only the supported metrics can be checked against the ledger. */
export interface FigureClaim {
  name: string
  value: number
  metric: 'income' | 'spending' | 'net' | 'category_spending'
  period: { start: string; end: string }
  /** Needed for category_spending */
  category?: string
  currency: string
  /** The connector tool and inputs the figure came from, for the user to trace */
  source?: string
}

export interface FigureCheck extends FigureClaim {
  /** The ledger's own figure for the same period, or null when this metric is not checked */
  actual: number | null
  matches: boolean | null
}

export interface Analysis {
  id: string
  kind: AnalysisKind
  title: string
  body: string
  periodStart: string
  periodEnd: string
  figures: FigureCheck[]
  verified: Verified
  status: AnalysisStatus
  writtenBy: string
  createdAt: string
  /** The newest transaction time the ledger had when this was saved */
  ledgerAsOf: string
  row?: number
}

export const TOLERANCE = 0.01

const r2 = (n: number) => Math.round(n * 100) / 100

/** The ledger's own figure for a claim, or null when the metric is not one we can check. */
function actualFor(claim: FigureClaim, transactions: Transaction[]): number | null {
  const span: Span = { start: claim.period.start, end: claim.period.end }
  if (claim.metric === 'income') return totalsFor(transactions, span, claim.currency).income
  if (claim.metric === 'spending') return totalsFor(transactions, span, claim.currency).spending
  if (claim.metric === 'net') return totalsFor(transactions, span, claim.currency).net
  if (claim.metric === 'category_spending') {
    if (!claim.category) return null
    const row = spendingByCategory(transactions, span, claim.currency, 1000).find((c) => c.category === claim.category)
    return r2(row?.amount ?? 0)
  }
  return null
}

/**
 * Checks every cited figure against the ledger. An entry is "yes" only when every figure is checked
 * and matches; "no" when any checked figure differs; otherwise "not_checked".
 */
export function verifyFigures(claims: FigureClaim[], transactions: Transaction[]): { figures: FigureCheck[]; verified: Verified } {
  const figures: FigureCheck[] = claims.map((c) => {
    const actual = actualFor(c, transactions)
    return { ...c, actual, matches: actual === null ? null : Math.abs(actual - c.value) <= TOLERANCE }
  })
  if (figures.some((f) => f.matches === false)) return { figures, verified: 'no' }
  if (figures.length && figures.every((f) => f.matches === true)) return { figures, verified: 'yes' }
  return { figures, verified: 'not_checked' }
}

/** True when the ledger has newer transactions than the ones the entry was written from. */
export function isStale(entry: Pick<Analysis, 'ledgerAsOf'>, transactions: Transaction[]): boolean {
  const latest = transactions.reduce((m, t) => (t.createdAt > m ? t.createdAt : m), '')
  return !!latest && !!entry.ledgerAsOf && latest > entry.ledgerAsOf
}

/** Newest transaction time in the ledger, as stored in ledger_as_of. */
export function ledgerAsOf(transactions: Transaction[]): string {
  return transactions.reduce((m, t) => (t.createdAt > m ? t.createdAt : m), '')
}

export function analysisToRow(a: Analysis): (string | number)[] {
  return [
    a.id,
    a.kind,
    a.title,
    a.body,
    a.periodStart,
    a.periodEnd,
    JSON.stringify(a.figures),
    a.verified,
    a.status,
    a.writtenBy,
    a.createdAt,
    a.ledgerAsOf,
  ]
}

/** Reads a row; unknown kinds or statuses fall back to safe values, and bad figures are dropped. */
export function rowToAnalysis(r: unknown[], row: number): Analysis | null {
  const id = String(r[0] ?? '').trim()
  if (!id) return null
  const kind = (ANALYSIS_KINDS as readonly string[]).includes(String(r[1])) ? (String(r[1]) as AnalysisKind) : 'analysis'
  const status = (ANALYSIS_STATUSES as readonly string[]).includes(String(r[8])) ? (String(r[8]) as AnalysisStatus) : 'open'
  const verified: Verified = r[7] === 'yes' || r[7] === 'no' ? r[7] : 'not_checked'
  let figures: FigureCheck[] = []
  try {
    const parsed = JSON.parse(String(r[6] ?? '[]'))
    if (Array.isArray(parsed)) figures = parsed as FigureCheck[]
  } catch {
    figures = []
  }
  return {
    id,
    kind,
    title: String(r[2] ?? ''),
    body: String(r[3] ?? ''),
    periodStart: String(r[4] ?? ''),
    periodEnd: String(r[5] ?? ''),
    figures,
    verified,
    status,
    writtenBy: String(r[9] ?? 'unknown') || 'unknown',
    createdAt: String(r[10] ?? ''),
    ledgerAsOf: String(r[11] ?? ''),
    row,
  }
}

