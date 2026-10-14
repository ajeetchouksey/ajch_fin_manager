/**
 * The user's Ledger for one MCP request: found in their Drive by the same app properties the web
 * app uses, loaded once, and written with the same client, so both stay in step.
 */

import { BUDGET_SHEET, DriveError, LedgerClient } from '../../frontend/src/lib/google/driveClient'
import { newId, type LedgerDocument, type LedgerLocation, type Transaction } from '../../frontend/src/lib/ledger/types'
import { newAccountId, newGoalId, type Account, type BalanceEntry, type Goal } from '../../frontend/src/lib/ledger/portfolio'
import type { TransactionDraft } from '../../frontend/src/lib/ledger/statement'
import type { Budget } from '../../frontend/src/lib/ledger/budgets'

export class NoLedgerError extends Error {
  constructor() {
    super('No FinBuddy Ledger was found in this Google Drive yet. Call create_ledger to make one, or open the FinBuddy web app once.')
    this.name = 'NoLedgerError'
  }
}

export interface LedgerData {
  transactions: Transaction[]
  accounts: Account[]
  balances: BalanceEntry[]
  goals: Goal[]
  documents: LedgerDocument[]
  budgets: Budget[]
}

export class LedgerSession {
  readonly client: LedgerClient
  private loc: LedgerLocation | null | undefined
  private data: LedgerData | null = null

  constructor(googleAccessToken: string) {
    this.client = new LedgerClient(async () => googleAccessToken)
  }

  /** The Ledger's location, or null when this Drive has none. */
  async location(): Promise<LedgerLocation | null> {
    if (this.loc === undefined) this.loc = await this.client.find()
    return this.loc
  }

  async requireLocation(): Promise<LedgerLocation> {
    const loc = await this.location()
    if (!loc) throw new NoLedgerError()
    return loc
  }

  async create(name: string): Promise<LedgerLocation> {
    this.loc = await this.client.create(name)
    this.data = null
    return this.loc
  }

  async load(): Promise<LedgerData> {
    if (this.data) return this.data
    const { spreadsheetId: id } = await this.requireLocation()
    const [transactions, accounts, balances, goals, documents, budgets] = await Promise.all([
      this.client.listTransactions(id),
      this.client.listAccounts(id),
      this.client.listBalances(id),
      this.client.listGoals(id),
      this.client.listDocuments(id),
      this.client.listBudgets(id),
    ])
    this.data = { transactions, accounts, balances, goals, documents, budgets }
    return this.data
  }

  private invalidate() {
    this.data = null
  }

  async appendTransactions(drafts: TransactionDraft[], source: Transaction['source']): Promise<Transaction[]> {
    const { spreadsheetId } = await this.requireLocation()
    const now = new Date().toISOString()
    const rows: Transaction[] = drafts.map((d) => ({ ...d, id: newId('tx'), documentIds: [], source, createdAt: now }))
    await this.client.appendTransactions(spreadsheetId, rows)
    this.invalidate()
    return rows
  }

  async updateTransactions(txs: Transaction[]) {
    const { spreadsheetId } = await this.requireLocation()
    await this.client.updateTransactions(spreadsheetId, txs)
    this.invalidate()
  }

  async deleteTransactions(txs: Transaction[]) {
    const { spreadsheetId } = await this.requireLocation()
    await this.client.deleteRows(spreadsheetId, 'Transactions', txs)
    this.invalidate()
  }

  /** Same behaviour as the web app: a new or changed balance is also kept in the Balances history. */
  async saveAccount(draft: Omit<Account, 'id' | 'createdAt' | 'row'>, existing?: Account): Promise<Account> {
    const { spreadsheetId } = await this.requireLocation()
    const account: Account = existing ? { ...existing, ...draft } : { ...draft, id: newAccountId(), createdAt: new Date().toISOString() }
    if (existing) await this.client.updateAccount(spreadsheetId, account)
    else await this.client.appendAccounts(spreadsheetId, [account])
    if (!existing || existing.balance !== account.balance || existing.asOf !== account.asOf) {
      await this.client.appendBalances(spreadsheetId, [{ accountId: account.id, date: account.asOf, balance: account.balance, recordedAt: new Date().toISOString() }])
    }
    this.invalidate()
    return account
  }

  /** Adds or changes the budget for a category (one row per category). */
  async saveBudget(draft: Omit<Budget, 'createdAt' | 'row'>, existing?: Budget): Promise<Budget> {
    const { spreadsheetId } = await this.requireLocation()
    const budget: Budget = { ...draft, createdAt: existing?.createdAt || new Date().toISOString(), row: existing?.row }
    if (existing) await this.client.updateBudget(spreadsheetId, budget)
    else await this.client.appendBudgets(spreadsheetId, [budget])
    this.invalidate()
    return budget
  }

  async deleteBudget(b: Budget) {
    const { spreadsheetId } = await this.requireLocation()
    await this.client.deleteRow(spreadsheetId, BUDGET_SHEET, b.row ?? 0, b.category)
    this.invalidate()
  }

  /** The file a saved document points to, from Drive. */
  async downloadDocument(d: LedgerDocument) {
    return this.client.downloadFile(d.id)
  }

  async deleteAccount(a: Account) {
    const { spreadsheetId } = await this.requireLocation()
    await this.client.deleteRows(spreadsheetId, 'Accounts', [a])
    this.invalidate()
  }

  async saveGoal(draft: Omit<Goal, 'id' | 'createdAt' | 'row'>, existing?: Goal): Promise<Goal> {
    const { spreadsheetId } = await this.requireLocation()
    const goal: Goal = existing ? { ...existing, ...draft } : { ...draft, id: newGoalId(), createdAt: new Date().toISOString() }
    if (existing) await this.client.updateGoal(spreadsheetId, goal)
    else await this.client.appendGoals(spreadsheetId, [goal])
    this.invalidate()
    return goal
  }

  async deleteGoal(g: Goal) {
    const { spreadsheetId } = await this.requireLocation()
    await this.client.deleteRows(spreadsheetId, 'Goals', [g])
    this.invalidate()
  }
}

/** A message the AI app can show the user, for any error from Drive or the Ledger. */
export function explain(error: unknown): string {
  if (error instanceof NoLedgerError) return error.message
  if (error instanceof DriveError) {
    if (error.status === 401) return 'Google access expired. Ask the user to reconnect FinBuddy in their AI app.'
    if (error.status === 409) return 'The Ledger was changed elsewhere at the same time. Read it again and retry.'
    return error.message
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
