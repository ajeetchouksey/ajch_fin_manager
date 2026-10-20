import type { LedgerDocument } from '../ledger/types'
import { yearBounds, type TaxCountry } from './summary'

/**
 * Documents to gather for a tax year, and the filing dates. A year counts from its start: Germany is the
 * calendar year; India's year 2025 is the financial year 2025-26 (1 April 2025 to 31 March 2026).
 */

export interface ChecklistItem {
  label: string
  /** Document types that count (see DOCUMENT_TYPES) */
  documentTypes: string[]
  /** Tags that count, for documents filed under a specific deduction */
  tags: string[]
}

export const CHECKLIST: Record<TaxCountry, ChecklistItem[]> = {
  DE: [
    { label: 'Lohnsteuerbescheinigung (annual wage statement)', documentTypes: ['Payslip', 'Tax document'], tags: ['lohnsteuerbescheinigung'] },
    { label: 'Donation receipts (Zuwendungsbestätigungen)', documentTypes: ['Tax document'], tags: ['tax:de:spenden'] },
    { label: 'Health and care insurance statements', documentTypes: ['Insurance', 'Tax document'], tags: ['tax:de:sonderausgaben'] },
    { label: 'Work-related receipts (Werbungskosten)', documentTypes: ['Receipt', 'Invoice'], tags: ['tax:de:werbungskosten'] },
  ],
  IN: [
    { label: 'Form 16 from your employer', documentTypes: ['Payslip', 'Tax document'], tags: ['form16'] },
    { label: 'Form 26AS / AIS (tax credit statement)', documentTypes: ['Tax document'], tags: ['26as', 'ais'] },
    { label: 'Investment proofs for 80C', documentTypes: ['Receipt', 'Tax document'], tags: ['tax:in:80c'] },
    { label: 'Health insurance premium receipts (80D)', documentTypes: ['Insurance', 'Receipt'], tags: ['tax:in:80d'] },
    { label: 'Donation receipts (80G)', documentTypes: ['Tax document'], tags: ['tax:in:80g'] },
    { label: 'Bank interest certificates', documentTypes: ['Bank statement', 'Tax document'], tags: [] },
  ],
}

export interface ChecklistResult extends ChecklistItem {
  found: LedgerDocument[]
  missing: boolean
}

/** Each item with the documents that satisfy it. Dated documents outside the year are not counted. */
export function documentChecklist(documents: LedgerDocument[], country: TaxCountry, year: number): ChecklistResult[] {
  const bounds = yearBounds(country, year)
  const inYear = documents.filter((d) => d.date >= bounds.start && d.date <= bounds.end)
  return CHECKLIST[country].map((item) => {
    const found = inYear.filter((d) => item.documentTypes.includes(d.type) || d.tags.some((t) => item.tags.includes(t)))
    return { ...item, found, missing: found.length === 0 }
  })
}

export interface Deadline {
  label: string
  /** ISO date */
  date: string
  note: string
  /** Set when the date comes from a secondary source and must be checked on the official portal */
  confirm: boolean
}

/**
 * Filing dates for a tax year. Only years whose dates have been checked are given; anything else returns
 * an empty list, so the app says "not covered" rather than guessing.
 */
export function filingDeadlines(country: TaxCountry, year: number): { deadlines: Deadline[]; covered: boolean } {
  if (country === 'DE' && year === 2025) {
    return {
      covered: true,
      deadlines: [
        {
          label: 'Income tax return for 2025',
          date: '2026-07-31',
          note: 'Standard deadline when you file yourself. A tax adviser can file later; those dates depend on the adviser.',
          confirm: true,
        },
      ],
    }
  }
  if (country === 'IN' && year === 2025) {
    return {
      covered: true,
      deadlines: [
        {
          label: 'ITR for FY 2025-26: salaried, ITR-1 or ITR-2',
          date: '2026-07-31',
          note: 'Due date reported for AY 2026-27 for individuals not needing an audit.',
          confirm: true,
        },
        {
          label: 'ITR for FY 2025-26: non-audit business or professional income',
          date: '2026-08-31',
          note: 'Reported as the due date for ITR-3 and ITR-4 filers with non-audit business income.',
          confirm: true,
        },
        {
          label: 'Belated return for FY 2025-26',
          date: '2026-12-31',
          note: 'Late filing with a fee, if the return was missed. Confirm the fee on the income tax portal.',
          confirm: true,
        },
      ],
    }
  }
  return { deadlines: [], covered: false }
}
