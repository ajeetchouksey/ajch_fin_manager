/**
 * "Hide amounts": one switch that masks every money figure ("€1,234.56" -> "€•••"), so the app can be
 * shown on a train or a shared screen. Pure and storage-free, because the connector shares this code;
 * the browser side (saving the choice, re-rendering) is in hooks/useHideAmounts.ts.
 */
let hidden = false
const listeners = new Set<() => void>()

export const MASK = '•••'

export function amountsHidden(): boolean {
  return hidden
}

export function setAmountsHidden(value: boolean): void {
  if (hidden === value) return
  hidden = value
  listeners.forEach((l) => l())
}

export function subscribeAmountsHidden(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Replaces the digits of a formatted amount with a mask and keeps the symbol, sign and any K/M/B suffix. */
export function maskAmount(s: string): string {
  return /\d/.test(s) ? s.replace(/\d[\d.,\s  ']*\d|\d/g, MASK) : s
}

/** Applies the mask when amounts are hidden. Wrap every formatted money string in this. */
export function privately(s: string): string {
  return hidden ? maskAmount(s) : s
}
