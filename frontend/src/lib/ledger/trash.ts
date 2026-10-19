import type { Analysis } from './analysis'
import type { Account } from './portfolio'
import type { LedgerDocument, Transaction } from './types'

/**
 * Trash: things the user removed (a transaction, a document, an import batch) are kept here for 30 days, so a
 * mistake can be restored. The Trash tab is separate from the working tabs, so removing something never changes
 * the figures that are calculated from the working tabs.
 */

export const TRASH_COLUMNS = ['id', 'kind', 'deleted_at', 'title', 'payload'] as const

/** Days a removed item is kept before it is erased for good. */
export const TRASH_RETENTION_DAYS = 30

export const TRASH_KINDS = ['transaction', 'document', 'account', 'analysis'] as const

export type TrashKind = (typeof TRASH_KINDS)[number]

export interface TrashItem {
  id: string
  kind: TrashKind
  /** ISO time the item was removed */
  deletedAt: string
  /** Shown in the list, so the user knows what it is without opening it */
  title: string
  /** The original row, as it was, so restoring puts it back exactly */
  payload: unknown
  /** 1-based sheet row, for deleting from the trash (not stored) */
  row?: number
}

export function trashToRow(t: TrashItem): (string | number)[] {
  return [t.id, t.kind, t.deletedAt, t.title, JSON.stringify(t.payload ?? null)]
}

/** Reads a trash row. Unknown kinds and unreadable payloads are skipped, never restored by guesswork. */
export function rowToTrash(r: unknown[], row: number): TrashItem | null {
  const id = String(r[0] ?? '').trim()
  const kind = String(r[1] ?? '')
  if (!id || !(TRASH_KINDS as readonly string[]).includes(kind)) return null
  try {
    return { id, kind: kind as TrashKind, deletedAt: String(r[2] ?? ''), title: String(r[3] ?? ''), payload: JSON.parse(String(r[4] ?? 'null')), row }
  } catch {
    return null
  }
}

const DAY_MS = 86_400_000

/** When an item is erased: the removal time plus the retention period. */
export function purgeAt(item: Pick<TrashItem, 'deletedAt'>): number {
  return Date.parse(item.deletedAt) + TRASH_RETENTION_DAYS * DAY_MS
}

/** Items past their retention period at `now`. Items with an unreadable time are kept, never erased by mistake. */
export function expiredItems(items: TrashItem[], now: Date): TrashItem[] {
  return items.filter((i) => {
    const at = purgeAt(i)
    return Number.isFinite(at) && at <= now.getTime()
  })
}

/** Whole days left before an item is erased, for showing "restore within N days". */
export function daysLeft(item: Pick<TrashItem, 'deletedAt'>, now: Date): number {
  return Math.max(0, Math.ceil((purgeAt(item) - now.getTime()) / DAY_MS))
}

/** Trash entry for a transaction. The row number is not kept: it is only valid while the row is in the sheet. */
export function transactionToTrash(t: Transaction, now: Date): TrashItem {
  const { row: _row, ...payload } = t
  const label = `${t.description || 'Transaction'} · ${t.date}`
  return { id: t.id, kind: 'transaction', deletedAt: now.toISOString(), title: label, payload }
}

/** Trash entry for a document record. The file itself stays in Drive; only its row moves. */
export function documentToTrash(d: LedgerDocument, now: Date): TrashItem {
  const { row: _row, ...payload } = d
  return { id: d.id, kind: 'document', deletedAt: now.toISOString(), title: d.title || d.fileName || 'Document', payload }
}

/** Trash entry for an account. Its balance history stays in the Balances tab and returns with it. */
export function accountToTrash(a: Account, now: Date): TrashItem {
  const { row: _row, ...payload } = a
  return { id: a.id, kind: 'account', deletedAt: now.toISOString(), title: a.name || 'Account', payload }
}

/** Trash entry for an AI analysis entry that was dismissed. */
export function analysisToTrash(a: Analysis, now: Date): TrashItem {
  const { row: _row, ...payload } = a
  return { id: a.id, kind: 'analysis', deletedAt: now.toISOString(), title: a.title || 'Analysis', payload }
}
