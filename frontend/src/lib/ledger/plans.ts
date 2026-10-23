/**
 * Planned investments: money the user intends to put aside, now or later, optionally for one goal.
 * Kept in the Plans tab of the Ledger (append new columns at the end only, like every other tab).
 * A plan is an intention, not a payment: nothing here moves money or changes a balance.
 */

import { parseNumber } from './money'
import { newId } from './types'

export const PLAN_COLUMNS = ['id', 'name', 'amount', 'currency', 'frequency', 'start_date', 'end_date', 'goal_id', 'account_id', 'notes', 'created_at'] as const

export type PlanFrequency = 'monthly' | 'quarterly' | 'yearly' | 'once'

export const PLAN_FREQUENCIES: Array<{ value: PlanFrequency; label: string; perYear: number }> = [
  { value: 'monthly', label: 'Every month', perYear: 12 },
  { value: 'quarterly', label: 'Every three months', perYear: 4 },
  { value: 'yearly', label: 'Every year', perYear: 1 },
  { value: 'once', label: 'One time', perYear: 0 },
]

export interface Plan {
  id: string
  name: string
  amount: number
  currency: string
  frequency: PlanFrequency
  /** YYYY-MM-DD, or '' for "from now" */
  startDate: string
  /** YYYY-MM-DD, or '' for "no end" */
  endDate: string
  goalId: string
  accountId: string
  notes: string
  createdAt: string
  row?: number
}

export type PlanDraft = Omit<Plan, 'id' | 'createdAt' | 'row'>

const str = (v: unknown) => String(v ?? '').trim()
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : '')
const FREQ = new Set<string>(PLAN_FREQUENCIES.map((f) => f.value))

export const newPlanId = () => newId('plan')

export function planToRow(p: Plan): (string | number)[] {
  return [p.id, p.name, p.amount, p.currency, p.frequency, p.startDate, p.endDate, p.goalId, p.accountId, p.notes, p.createdAt]
}

export function rowToPlan(r: unknown[], row: number): Plan | null {
  const id = str(r[0])
  if (!id) return null
  const amount = parseNumber(r[2] as string | number)
  const frequency = str(r[4])
  return {
    id,
    name: str(r[1]) || 'Planned investment',
    amount: Number.isFinite(amount) && amount !== null ? Math.abs(amount) : 0,
    currency: str(r[3]) || 'EUR',
    frequency: FREQ.has(frequency) ? (frequency as PlanFrequency) : 'monthly',
    startDate: date(r[5]),
    endDate: date(r[6]),
    goalId: str(r[7]),
    accountId: str(r[8]),
    notes: str(r[9]),
    createdAt: str(r[10]),
    row,
  }
}

/** What a plan comes to per month on average (a one-time amount is not a monthly figure). */
export function monthlyEquivalent(p: Pick<Plan, 'amount' | 'frequency'>): number {
  const perYear = PLAN_FREQUENCIES.find((f) => f.value === p.frequency)?.perYear ?? 0
  return Math.round(((p.amount * perYear) / 12) * 100) / 100
}

export type PlanState = 'upcoming' | 'running' | 'ended'

/** A plan with no end date runs until removed. A one-time plan has ended once its date has passed. */
export function planState(p: Pick<Plan, 'startDate' | 'endDate' | 'frequency'>, today: string): PlanState {
  if (p.frequency === 'once') {
    const day = p.startDate || today
    return day > today ? 'upcoming' : day === today ? 'running' : 'ended'
  }
  if (p.endDate && p.endDate < today) return 'ended'
  if (p.startDate && p.startDate > today) return 'upcoming'
  return 'running'
}

/** The regular monthly amount of the plans that are running or still to start, per currency; one-time plans are not included. */
export function plannedMonthly(plans: Plan[], today: string, goalId?: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of plans) {
    if (goalId !== undefined && p.goalId !== goalId) continue
    if (planState(p, today) === 'ended') continue
    const m = monthlyEquivalent(p)
    if (m > 0) out.set(p.currency, Math.round(((out.get(p.currency) ?? 0) + m) * 100) / 100)
  }
  return out
}

/** Why a plan cannot be saved yet, or null. */
export function planProblem(d: Pick<PlanDraft, 'name' | 'amount' | 'frequency' | 'startDate' | 'endDate'>): string | null {
  if (!d.name.trim()) return 'Give the plan a name.'
  if (!(d.amount > 0)) return 'Enter an amount above zero.'
  if (d.frequency === 'once' && !d.startDate) return 'Pick the date for a one-time amount.'
  if (d.startDate && d.endDate && d.endDate < d.startDate) return 'The end date is before the start date.'
  return null
}

/** What a plan says in a line, e.g. "200 every month from 2026-12-01 until 2030-12-31". */
export function describePlan(p: Plan, money: (v: number, currency: string) => string): string {
  const f = PLAN_FREQUENCIES.find((x) => x.value === p.frequency)
  const when = p.frequency === 'once' ? (p.startDate ? ` on ${p.startDate}` : '') : `${f ? ` ${f.label.toLowerCase()}` : ''}${p.startDate ? ` from ${p.startDate}` : ''}${p.endDate ? ` until ${p.endDate}` : ''}`
  return `${money(p.amount, p.currency)}${when}`
}
