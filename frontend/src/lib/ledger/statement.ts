/**
 * Turns one row of a bank statement into a Ledger transaction. Shared by the import dialog and the
 * FinBuddy connector (MCP), so a statement imported from an AI app gives the same result as one
 * imported in the web app.
 */

import { parseAmount, parseDate, type ColumnMap, type DateFormat } from './csv'
import { suggestCategory } from './categorize'
import { parseTags, type Direction, type Transaction } from './types'

/** How amounts show money in and out when there is one amount column. */
export type Sign = 'negative-out' | 'positive-out' | 'all-out' | 'all-in'

export type TransactionDraft = Omit<Transaction, 'id' | 'createdAt' | 'documentIds' | 'source'>

export interface RowOptions {
  dateFormat: DateFormat
  sign: Sign
  /** Used when the row has no valid currency of its own */
  currency: string
  account: string
  /** A fixed category for the row; empty = suggest one */
  category: string
  tags: string
  notes: string
  learned?: Map<string, { category: string; direction: Direction }>
  /** The user's own name(s); payments to or from them become transfers */
  ownNames?: string[]
  userRules?: Array<{ match: string; category: string }>
  /** Categories the user already has, so a bank's own category can be kept when it matches */
  knownCategories: string[]
}

export type StatementRow = { ok: true; tx: TransactionDraft; suggested: boolean } | { ok: false; reason: string; cells: string[] }

export function statementRow(r: string[], map: ColumnMap, o: RowOptions): StatementRow {
  const cell = (i: number | undefined) => (i !== undefined ? (r[i] ?? '').trim() : '')
  const date = map.date !== undefined ? parseDate(r[map.date] ?? '', o.dateFormat) : null
  let value: number | null
  let direction: Direction
  if (map.credit !== undefined) {
    // Separate columns: money out in `amount`, money in in `credit`
    const out = parseAmount(cell(map.amount))
    const inn = parseAmount(cell(map.credit))
    if (inn) {
      value = Math.abs(inn)
      direction = 'in'
    } else {
      value = out
      direction = out !== null && out < 0 ? 'in' : 'out' // a negative debit is a reversal
    }
  } else {
    value = map.amount !== undefined ? parseAmount(r[map.amount] ?? '') : null
    if (o.sign === 'all-out') direction = 'out'
    else if (o.sign === 'all-in') direction = 'in'
    else if (o.sign === 'negative-out') direction = (value ?? 0) < 0 ? 'out' : 'in'
    else direction = (value ?? 0) < 0 ? 'in' : 'out'
  }
  if (!date || value === null || value === 0) return { ok: false, reason: !date ? 'No valid date' : 'No amount', cells: r }

  // Who the money went to or came from, plus what it was for
  const party = direction === 'out' && map.recipient !== undefined ? cell(map.recipient) : cell(map.payee)
  const purpose = cell(map.description)
  const text = (party && !purpose.toLowerCase().includes(party.toLowerCase()) ? [party, purpose].filter(Boolean).join(' — ') : purpose || party).replace(/\s+/g, ' ')
  const bankCategory = cell(map.category).slice(0, 60)
  const rowCurrency = cell(map.currency).toUpperCase()

  let category = o.category
  let suggested = false
  if (!category) {
    const hit = suggestCategory([party, purpose, cell(map.kind), bankCategory].join(' '), direction, o.learned, { ownNames: o.ownNames, userRules: o.userRules })
    const knownBank = o.knownCategories.find((c) => c.toLowerCase() === bankCategory.toLowerCase())
    category = hit?.category ?? knownBank ?? (direction === 'out' ? 'Other' : 'Other income')
    suggested = !!hit
  }
  return {
    ok: true,
    suggested,
    tx: {
      date,
      direction,
      amount: Math.round(Math.abs(value) * 100) / 100,
      currency: /^[A-Z]{3}$/.test(rowCurrency) ? rowCurrency : o.currency,
      account: o.account.trim(),
      category,
      description: text.slice(0, 200) || '(no description)',
      notes: [cell(map.notes), o.notes.trim()].filter(Boolean).join(' — ').slice(0, 2000),
      tags: parseTags(o.tags),
    },
  }
}
