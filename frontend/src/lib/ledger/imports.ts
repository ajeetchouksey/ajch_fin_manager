import type { Transaction } from './types'

/** One import run: every transaction that was saved together. */
export interface ImportBatch {
  /** The shared time the rows were saved; it identifies the batch */
  createdAt: string
  transactions: Transaction[]
  count: number
  /** Money in and out for the batch, in the first row's currency */
  inflow: number
  outflow: number
}

/**
 * Imports grouped by the time they were saved (each import writes one shared timestamp), newest first.
 * Manual entries are not included: only imports can be undone as a batch.
 */
export function importBatches(transactions: Transaction[]): ImportBatch[] {
  const byTime = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.source !== 'import' || !t.createdAt) continue
    const list = byTime.get(t.createdAt) ?? []
    list.push(t)
    byTime.set(t.createdAt, list)
  }
  return [...byTime.entries()]
    .map(([createdAt, txs]) => {
      let inflow = 0
      let outflow = 0
      for (const t of txs) {
        if (t.direction === 'in') inflow += t.amount
        else outflow += t.amount
      }
      return { createdAt, transactions: txs, count: txs.length, inflow, outflow }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
