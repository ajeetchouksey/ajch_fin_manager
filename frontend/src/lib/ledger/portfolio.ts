/**
 * Portfolio part of the Ledger data contract v1 (ADR-001): the Accounts, Balances and Goals tabs.
 * Same rules as Transactions: append new columns at the end only.
 *
 * - Accounts: everything the user owns, owes or is insured for, with its latest value.
 * - Balances: one row per balance update, so net worth can be shown over time.
 * - Goals: what the user is saving for.
 */

import { newId } from './types'

export const ACCOUNT_COLUMNS = ['id', 'name', 'type', 'institution', 'currency', 'balance', 'as_of', 'rate', 'monthly', 'notes', 'created_at'] as const
export const BALANCE_COLUMNS = ['account_id', 'date', 'balance', 'recorded_at'] as const
export const GOAL_COLUMNS = ['id', 'name', 'target', 'currency', 'target_date', 'saved', 'monthly', 'account_id', 'priority', 'notes', 'created_at'] as const

/** cash/investments/retirement/property count towards net worth; debt subtracts; cover is insurance (not counted). */
export type AccountGroup = 'cash' | 'investments' | 'retirement' | 'property' | 'debt' | 'cover'

export interface AccountType {
  value: string
  label: string
  group: AccountGroup
  /** Money the user can reach within days (for the emergency fund) */
  liquid?: boolean
  /** Assumed yearly return or interest in % when the user leaves it empty */
  defaultRate: number
  /** Label for the "monthly" column */
  monthlyLabel?: string
}

export const ACCOUNT_TYPES: AccountType[] = [
  { value: 'current', label: 'Current account', group: 'cash', liquid: true, defaultRate: 0 },
  { value: 'savings', label: 'Savings / Tagesgeld', group: 'cash', liquid: true, defaultRate: 2, monthlyLabel: 'Monthly saving' },
  { value: 'fixed_deposit', label: 'Fixed deposit / Festgeld', group: 'cash', defaultRate: 2.5 },
  { value: 'cash', label: 'Cash', group: 'cash', liquid: true, defaultRate: 0 },
  { value: 'brokerage', label: 'ETFs & funds (depot)', group: 'investments', defaultRate: 5, monthlyLabel: 'Monthly savings plan' },
  { value: 'shares', label: 'Shares', group: 'investments', defaultRate: 5, monthlyLabel: 'Monthly investment' },
  { value: 'mutual_fund', label: 'Mutual funds / SIP', group: 'investments', defaultRate: 7, monthlyLabel: 'Monthly SIP' },
  { value: 'gold', label: 'Gold & precious metals', group: 'investments', defaultRate: 3 },
  { value: 'crypto', label: 'Crypto', group: 'investments', defaultRate: 0 },
  { value: 'pension', label: 'Pension / retirement (bAV, Riester, Rürup, EPF, PPF, NPS)', group: 'retirement', defaultRate: 4, monthlyLabel: 'Monthly contribution' },
  { value: 'property', label: 'Property', group: 'property', defaultRate: 2 },
  { value: 'other_asset', label: 'Other asset', group: 'property', defaultRate: 0 },
  { value: 'credit_card', label: 'Credit card', group: 'debt', defaultRate: 18, monthlyLabel: 'Monthly payment' },
  { value: 'loan', label: 'Loan (personal, car, student)', group: 'debt', defaultRate: 7, monthlyLabel: 'Monthly payment (EMI)' },
  { value: 'mortgage', label: 'Mortgage / home loan', group: 'debt', defaultRate: 4, monthlyLabel: 'Monthly payment (EMI)' },
  { value: 'ins_liability', label: 'Insurance: personal liability (Haftpflicht)', group: 'cover', defaultRate: 0, monthlyLabel: 'Monthly premium' },
  { value: 'ins_health', label: 'Insurance: health', group: 'cover', defaultRate: 0, monthlyLabel: 'Monthly premium' },
  { value: 'ins_life', label: 'Insurance: term life', group: 'cover', defaultRate: 0, monthlyLabel: 'Monthly premium' },
  { value: 'ins_disability', label: 'Insurance: disability / income (BU)', group: 'cover', defaultRate: 0, monthlyLabel: 'Monthly premium' },
  { value: 'ins_home', label: 'Insurance: home contents (Hausrat)', group: 'cover', defaultRate: 0, monthlyLabel: 'Monthly premium' },
  { value: 'ins_other', label: 'Insurance: other', group: 'cover', defaultRate: 0, monthlyLabel: 'Monthly premium' },
]

export const GROUP_LABELS: Record<AccountGroup, string> = {
  cash: 'Cash & savings',
  investments: 'Investments',
  retirement: 'Retirement',
  property: 'Property & other',
  debt: 'Debts',
  cover: 'Insurance',
}

const OTHER_TYPE: AccountType = { value: 'other_asset', label: 'Other asset', group: 'property', defaultRate: 0 }
export const accountType = (value: string): AccountType => ACCOUNT_TYPES.find((t) => t.value === value) ?? OTHER_TYPE

export interface Account {
  id: string
  name: string
  type: string
  institution: string
  currency: string
  /** Current value; for debts the amount owed (positive); for insurance the sum insured */
  balance: number
  asOf: string // YYYY-MM-DD
  /** Interest or expected return in % per year; null = use the type's default */
  rate: number | null
  /** Monthly contribution, payment or premium */
  monthly: number
  notes: string
  createdAt: string
  row?: number
}

export interface BalanceEntry {
  accountId: string
  date: string
  balance: number
  recordedAt: string
}

export type GoalPriority = 'high' | 'medium' | 'low'

export interface Goal {
  id: string
  name: string
  target: number
  currency: string
  targetDate: string // YYYY-MM-DD or ''
  /** Saved so far; ignored when the goal is linked to an account (its balance counts instead) */
  saved: number
  monthly: number
  accountId: string
  priority: GoalPriority
  notes: string
  createdAt: string
  row?: number
}

const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}
const str = (v: unknown) => String(v ?? '').trim()

export function accountToRow(a: Account): (string | number)[] {
  return [a.id, a.name, a.type, a.institution, a.currency, a.balance, a.asOf, a.rate ?? '', a.monthly, a.notes, a.createdAt]
}

export function rowToAccount(r: unknown[], row: number): Account | null {
  const id = str(r[0])
  if (!id) return null
  return {
    id,
    name: str(r[1]) || 'Account',
    type: str(r[2]) || 'other_asset',
    institution: str(r[3]),
    currency: str(r[4]) || 'EUR',
    balance: Math.abs(num(r[5])),
    asOf: str(r[6]),
    rate: str(r[7]) === '' ? null : num(r[7]),
    monthly: Math.abs(num(r[8])),
    notes: str(r[9]),
    createdAt: str(r[10]),
    row,
  }
}

export function balanceToRow(b: BalanceEntry): (string | number)[] {
  return [b.accountId, b.date, b.balance, b.recordedAt]
}

export function rowToBalance(r: unknown[]): BalanceEntry | null {
  const accountId = str(r[0])
  const date = str(r[1])
  if (!accountId || !date) return null
  return { accountId, date, balance: Math.abs(num(r[2])), recordedAt: str(r[3]) }
}

export function goalToRow(g: Goal): (string | number)[] {
  return [g.id, g.name, g.target, g.currency, g.targetDate, g.saved, g.monthly, g.accountId, g.priority, g.notes, g.createdAt]
}

export function rowToGoal(r: unknown[], row: number): Goal | null {
  const id = str(r[0])
  if (!id) return null
  const p = str(r[8])
  return {
    id,
    name: str(r[1]) || 'Goal',
    target: Math.abs(num(r[2])),
    currency: str(r[3]) || 'EUR',
    targetDate: str(r[4]),
    saved: Math.abs(num(r[5])),
    monthly: Math.abs(num(r[6])),
    accountId: str(r[7]),
    priority: p === 'high' || p === 'low' ? p : 'medium',
    notes: str(r[9]),
    createdAt: str(r[10]),
    row,
  }
}

export const newAccountId = () => newId('acc')
export const newGoalId = () => newId('goal')
