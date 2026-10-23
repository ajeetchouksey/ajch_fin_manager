import type { Transaction } from './types'

/**
 * Links between rows of the Ledger (the optional "link" column, added at the end of the Transactions
 * tab). A link says that rows belong together:
 *   transfer:<ref>   the two legs of one move between the user's own accounts (both rows share it)
 *   refund:<id>      this row is money back from the purchase with that transaction id
 * Rows without a link are as they always were; nothing else reads the column.
 */

export type LinkKind = 'transfer' | 'refund'

export interface RowLink {
  kind: LinkKind
  ref: string
}

const LINK = /^(transfer|refund):([\w-]{1,40})$/

export const LINK_PATTERN = LINK
export const makeLink = (kind: LinkKind, ref: string) => `${kind}:${ref}`

export function parseLink(link?: string | null): RowLink | null {
  const m = LINK.exec((link ?? '').trim())
  return m ? { kind: m[1] as LinkKind, ref: m[2] } : null
}

/** The rows a row is linked to: the other leg of a transfer, the purchase a refund undoes, or the refunds of a purchase. */
export function linkedWith(tx: Transaction[], t: Transaction): Transaction[] {
  const mine = parseLink(t.link)
  return tx.filter((u) => {
    if (u.id === t.id) return false
    const theirs = parseLink(u.link)
    if (mine?.kind === 'transfer') return theirs?.kind === 'transfer' && theirs.ref === mine.ref
    if (mine?.kind === 'refund' && u.id === mine.ref) return true
    return theirs?.kind === 'refund' && theirs.ref === t.id
  })
}

/**
 * The rows to save to take a row out of its link. Unlinking a transfer frees both legs, so no row is
 * left pointing at a partner that no longer points back. Categories are not touched.
 */
export function unlinkRows(tx: Transaction[], t: Transaction): Transaction[] {
  const mine = parseLink(t.link)
  if (!mine) return []
  const rows = mine.kind === 'transfer' ? tx.filter((u) => parseLink(u.link)?.kind === 'transfer' && parseLink(u.link)?.ref === mine.ref) : [t]
  return rows.map((u) => ({ ...u, link: undefined }))
}
