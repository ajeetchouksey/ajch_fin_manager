import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { clearDriveToken, getStoredDriveToken, requestDriveToken } from '../lib/google/gis'
import { ACCOUNT_SHEET, ANALYSIS_SHEET, BUDGET_SHEET, DOC_SHEET, DriveError, GOAL_SHEET, LedgerClient, TRASH_SHEET, TX_SHEET } from '../lib/google/driveClient'
import { accountToTrash, analysisToTrash, documentToTrash, expiredItems, transactionToTrash, type TrashItem } from '../lib/ledger/trash'
import type { ImportBatch } from '../lib/ledger/imports'
import type { Budget } from '../lib/ledger/budgets'
import type { Analysis, AnalysisStatus } from '../lib/ledger/analysis'
import { mergeProfile, profileToRows, rowsToProfile, type ProfileRow } from '../lib/ledger/profile'
import type { UserSchemaDefinition } from '../types'
import { newId, todayIso, type LedgerDocument, type LedgerLocation, type Transaction } from '../lib/ledger/types'
import { newAccountId, newGoalId, type Account, type BalanceEntry, type Goal } from '../lib/ledger/portfolio'

/**
 * The Ledger lives in the user's own Google Drive (ADR-001). This context connects to it,
 * keeps the loaded rows in memory and offers the write actions the pages need.
 * Only file ids are remembered on this device; no financial data is sent to our server.
 */

export type LedgerStatus = 'checking' | 'disconnected' | 'reconnect' | 'loading' | 'ready' | 'error'

export interface DocumentDraft {
  file: File
  title: string
  type: string
  date: string
  notes: string
  tags: string[]
}

export type AccountDraft = Omit<Account, 'id' | 'createdAt' | 'row'>
export type GoalDraft = Omit<Goal, 'id' | 'createdAt' | 'row'>

interface LedgerContextValue {
  status: LedgerStatus
  error: string | null
  location: LedgerLocation | null
  transactions: Transaction[]
  documents: LedgerDocument[]
  accounts: Account[]
  balances: BalanceEntry[]
  goals: Goal[]
  budgets: Budget[]
  analysis: Analysis[]
  /** The financial profile from the Profile tab, or null when none is saved yet */
  profile: UserSchemaDefinition | null
  busy: boolean
  connect: (folderName: string) => Promise<void>
  reconnect: () => Promise<void>
  refresh: () => Promise<void>
  disconnect: () => void
  addTransaction: (t: Omit<Transaction, 'id' | 'createdAt' | 'documentIds' | 'source'>, attachments: DocumentDraft[]) => Promise<Transaction>
  updateTransaction: (t: Transaction) => Promise<void>
  /** Writes several transactions in one request. Used for bulk changes and their undo. */
  updateTransactions: (txs: Transaction[]) => Promise<void>
  importTransactions: (rows: Array<Omit<Transaction, 'id' | 'createdAt' | 'documentIds' | 'source'>>) => Promise<number>
  /** Moves the transaction to Trash, where it can be restored for 30 days. */
  deleteTransaction: (t: Transaction) => Promise<void>
  uploadDocuments: (drafts: DocumentDraft[], transactionId?: string) => Promise<LedgerDocument[]>
  /** Moves the document record to Trash. The file stays in Drive. */
  deleteDocumentRecord: (d: LedgerDocument) => Promise<void>
  /** Moves every transaction in an import batch to Trash. They can be restored from there. */
  undoImport: (batch: ImportBatch) => Promise<void>
  /** Moves dismissed AI analysis entries to Trash. Open and done entries are kept. */
  clearDismissedAnalysis: () => Promise<void>
  /** Items removed and not yet erased, newest last. */
  trash: TrashItem[]
  /** Puts a trashed transaction or document back in the Ledger. */
  restoreFromTrash: (item: TrashItem) => Promise<void>
  /** Erases a trashed item now, without waiting for the 30 days. */
  eraseFromTrash: (item: TrashItem) => Promise<void>
  /** Add an account, or update one; a changed balance is also kept in the Balances history. */
  saveAccount: (draft: AccountDraft, existing?: Account) => Promise<Account>
  deleteAccount: (a: Account) => Promise<void>
  saveGoal: (draft: GoalDraft, existing?: Goal) => Promise<Goal>
  deleteGoal: (g: Goal) => Promise<void>
  /** Adds or changes the budget for a category (one per category). */
  saveBudget: (draft: Omit<Budget, 'createdAt' | 'row'>, existing?: Budget) => Promise<Budget>
  deleteBudget: (b: Budget) => Promise<void>
  /** Delete all data: transactions and accounts go to Trash; goals and budgets are removed. Documents and the profile stay. */
  clearLedger: () => Promise<void>
  /** Marks an AI analysis entry open, done or dismissed. Entries are never deleted here. */
  setAnalysisStatus: (a: Analysis, status: AnalysisStatus) => Promise<void>
  /** Saves profile fields to the Profile tab. Fields sent replace what is stored; others are kept. */
  saveProfile: (update: Partial<UserSchemaDefinition>) => Promise<UserSchemaDefinition>
  /** Saves a report as a Google Doc in the FinBuddy Documents folder. Returns the link. */
  createReportDoc: (name: string, html: string) => Promise<string>
  clearError: () => void
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

const locationKey = (userId: string) => `aarya.ledger.${userId}`

function loadLocation(userId: string): LedgerLocation | null {
  try {
    const raw = localStorage.getItem(locationKey(userId))
    return raw ? (JSON.parse(raw) as LedgerLocation) : null
  } catch {
    return null
  }
}

function saveLocation(userId: string, loc: LedgerLocation | null) {
  try {
    if (loc) localStorage.setItem(locationKey(userId), JSON.stringify(loc))
    else localStorage.removeItem(locationKey(userId))
  } catch {
    /* storage unavailable: the app finds the Ledger again by searching Drive */
  }
}

const MAX_FILE_BYTES = 25 * 1024 * 1024

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [status, setStatus] = useState<LedgerStatus>('checking')
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<LedgerLocation | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [documents, setDocuments] = useState<LedgerDocument[]>([])
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<BalanceEntry[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [analysis, setAnalysis] = useState<Analysis[]>([])
  const [profileRows, setProfileRows] = useState<ProfileRow[]>([])
  const profile = useMemo(() => rowsToProfile(profileRows), [profileRows])
  const [busy, setBusy] = useState(false)
  const locRef = useRef<LedgerLocation | null>(null)
  useEffect(() => {
    locRef.current = location
  }, [location])

  const client = useMemo(
    () =>
      new LedgerClient(async () => {
        const t = getStoredDriveToken()
        if (!t) throw new DriveError('Your Google Drive connection expired. Please reconnect.', 401)
        return t.accessToken
      }),
    [],
  )

  const handleError = useCallback((err: unknown) => {
    if (err instanceof DriveError && err.status === 401) {
      clearDriveToken()
      setStatus('reconnect')
      setError(null)
      return
    }
    setError(err instanceof Error ? err.message : 'Something went wrong with Google Drive.')
  }, [])

  // Ledgers created before a tab existed get it added once per session
  const checkedTabs = useRef<string | null>(null)

  const load = useCallback(
    async (loc: LedgerLocation) => {
      if (checkedTabs.current !== loc.spreadsheetId) {
        await client.initialiseSheet(loc.spreadsheetId)
        checkedTabs.current = loc.spreadsheetId
      }
      const id = loc.spreadsheetId
      const [tx, docs, accs, bals, gls, buds, anls, prof, bin] = await Promise.all([
        client.listTransactions(id),
        client.listDocuments(id),
        client.listAccounts(id),
        client.listBalances(id),
        client.listGoals(id),
        client.listBudgets(id),
        client.listAnalysis(id),
        client.listProfile(id),
        client.listTrash(id),
      ])
      // Items past the retention period are erased; a failure here must not stop the Ledger loading
      const expired = expiredItems(bin, new Date())
      if (expired.length) await client.deleteRows(id, TRASH_SHEET, expired).catch(() => undefined)
      setTrash(bin.filter((i) => !expired.includes(i)))
      setTransactions(tx)
      setDocuments(docs)
      setAccounts(accs)
      setBalances(bals)
      setGoals(gls)
      setBudgets(buds)
      setAnalysis(anls)
      setProfileRows(prof)
    },
    [client],
  )

  // On start: if this device linked Drive before and the token is still valid, load straight away.
  useEffect(() => {
    if (!userId) return
    const saved = loadLocation(userId)
    if (!saved) {
      setStatus('disconnected')
      return
    }
    setLocation(saved)
    if (!getStoredDriveToken()) {
      setStatus('reconnect')
      return
    }
    setStatus('loading')
    load(saved)
      .then(() => setStatus('ready'))
      .catch((err) => {
        if (err instanceof DriveError && err.status === 404) {
          saveLocation(userId, null)
          setLocation(null)
          setStatus('disconnected')
          setError('Your Ledger could not be found in Google Drive. Connect again to create a new one.')
          return
        }
        handleError(err)
        if (!(err instanceof DriveError && err.status === 401)) setStatus('error')
      })
  }, [userId, load, handleError])

  const linkAndLoad = useCallback(
    async (folderName: string | null) => {
      setBusy(true)
      setError(null)
      try {
        await requestDriveToken(user?.email)
        setStatus('loading')
        const loc = (await client.find()) ?? (folderName !== null ? await client.create(folderName) : null)
        if (!loc) {
          // Reconnecting, but the Ledger is gone: ask to create a new one
          saveLocation(userId, null)
          setLocation(null)
          setStatus('disconnected')
          setError('Your Ledger could not be found in Google Drive. Connect again to create a new one.')
          return
        }
        saveLocation(userId, loc)
        setLocation(loc)
        await load(loc)
        setStatus('ready')
      } catch (err) {
        handleError(err)
        setStatus((s) => (s === 'reconnect' ? 'reconnect' : locRef.current ? 'reconnect' : 'disconnected'))
      } finally {
        setBusy(false)
      }
    },
    [client, load, handleError, user?.email, userId],
  )

  const connect = useCallback((folderName: string) => linkAndLoad(folderName), [linkAndLoad])
  const reconnect = useCallback(() => linkAndLoad(locRef.current?.folderName ?? 'AaryaAI Finance'), [linkAndLoad])

  const refresh = useCallback(async () => {
    const loc = locRef.current
    if (!loc) return
    setBusy(true)
    try {
      await load(loc)
      setError(null)
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }, [load, handleError])

  const disconnect = useCallback(() => {
    saveLocation(userId, null)
    clearDriveToken()
    setLocation(null)
    setTransactions([])
    setDocuments([])
    setAccounts([])
    setBalances([])
    setGoals([])
    setBudgets([])
    setAnalysis([])
    setProfileRows([])
    setTrash([])
    setStatus('disconnected')
  }, [userId])

  const requireLoc = () => {
    const loc = locRef.current
    if (!loc) throw new Error('Connect Google Drive first.')
    return loc
  }

  const uploadDrafts = useCallback(
    async (loc: LedgerLocation, drafts: DocumentDraft[], transactionIds: string[]): Promise<LedgerDocument[]> => {
      const out: LedgerDocument[] = []
      for (const d of drafts) {
        if (d.file.size > MAX_FILE_BYTES) throw new Error(`"${d.file.name}" is larger than 25 MB. Please upload a smaller file.`)
        const uploaded = await client.uploadFile(loc.documentsFolderId, d.file)
        out.push({
          id: uploaded.id,
          title: d.title.trim() || d.file.name,
          type: d.type,
          date: d.date,
          notes: d.notes.trim(),
          tags: d.tags,
          transactionIds,
          fileName: uploaded.name,
          mimeType: uploaded.mimeType || d.file.type,
          link: uploaded.webViewLink,
          uploadedAt: new Date().toISOString(),
        })
      }
      if (out.length) await client.appendDocuments(loc.spreadsheetId, out)
      return out
    },
    [client],
  )

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true)
      setError(null)
      try {
        return await fn()
      } catch (err) {
        handleError(err)
        throw err
      } finally {
        setBusy(false)
      }
    },
    [handleError],
  )

  const addTransaction: LedgerContextValue['addTransaction'] = useCallback(
    (input, attachments) =>
      run(async () => {
        const loc = requireLoc()
        const id = newId('tx')
        const docs = await uploadDrafts(loc, attachments, [id])
        const tx: Transaction = {
          ...input,
          id,
          documentIds: docs.map((d) => d.id),
          source: 'manual',
          createdAt: new Date().toISOString(),
        }
        await client.appendTransactions(loc.spreadsheetId, [tx])
        await load(loc)
        return tx
      }),
    [run, uploadDrafts, client, load],
  )

  const updateTransactions: LedgerContextValue['updateTransactions'] = useCallback(
    (txs) =>
      run(async () => {
        const loc = requireLoc()
        await client.updateTransactions(loc.spreadsheetId, txs)
        await load(loc)
      }),
    [run, client, load],
  )

  const updateTransaction: LedgerContextValue['updateTransaction'] = useCallback(
    (t) =>
      run(async () => {
        const loc = requireLoc()
        await client.updateTransaction(loc.spreadsheetId, t)
        await load(loc)
      }),
    [run, client, load],
  )

  const importTransactions: LedgerContextValue['importTransactions'] = useCallback(
    (rows) =>
      run(async () => {
        const loc = requireLoc()
        const now = new Date().toISOString()
        const tx: Transaction[] = rows.map((r) => ({ ...r, id: newId('tx'), documentIds: [], source: 'import', createdAt: now }))
        await client.appendTransactions(loc.spreadsheetId, tx)
        await load(loc)
        return tx.length
      }),
    [run, client, load],
  )

  const deleteTransaction: LedgerContextValue['deleteTransaction'] = useCallback(
    (t) =>
      run(async () => {
        const loc = requireLoc()
        // Trash first: if the removal then fails, the item is in both places, never lost
        await client.appendTrash(loc.spreadsheetId, [transactionToTrash(t, new Date())])
        await client.deleteRow(loc.spreadsheetId, TX_SHEET, t.row ?? 0, t.id)
        await load(loc)
      }),
    [run, client, load],
  )

  const undoImport: LedgerContextValue['undoImport'] = useCallback(
    (batch) =>
      run(async () => {
        const loc = requireLoc()
        // Trash first, as for a single delete: a failed removal leaves the rows in both places, never lost
        await client.appendTrash(loc.spreadsheetId, batch.transactions.map((t) => transactionToTrash(t, new Date())))
        await client.deleteRows(loc.spreadsheetId, TX_SHEET, batch.transactions.map((t) => ({ row: t.row, id: t.id })))
        await load(loc)
      }),
    [run, client, load],
  )

  const restoreFromTrash: LedgerContextValue['restoreFromTrash'] = useCallback(
    (item) =>
      run(async () => {
        const loc = requireLoc()
        if (item.kind === 'transaction') {
          await client.appendTransactions(loc.spreadsheetId, [item.payload as Transaction])
        } else if (item.kind === 'document') {
          await client.appendDocuments(loc.spreadsheetId, [item.payload as LedgerDocument])
        } else if (item.kind === 'account') {
          await client.appendAccounts(loc.spreadsheetId, [item.payload as Account])
        } else {
          await client.appendAnalysis(loc.spreadsheetId, [item.payload as Analysis])
        }
        await client.deleteRow(loc.spreadsheetId, TRASH_SHEET, item.row ?? 0, item.id)
        await load(loc)
      }),
    [run, client, load],
  )

  const clearDismissedAnalysis: LedgerContextValue['clearDismissedAnalysis'] = useCallback(
    () =>
      run(async () => {
        const loc = requireLoc()
        const dismissed = analysis.filter((a) => a.status === 'dismissed')
        if (dismissed.length === 0) return
        await client.appendTrash(loc.spreadsheetId, dismissed.map((a) => analysisToTrash(a, new Date())))
        await client.deleteRows(loc.spreadsheetId, ANALYSIS_SHEET, dismissed.map((a) => ({ row: a.row, id: a.id })))
        await load(loc)
      }),
    [run, client, load, analysis],
  )

  const clearLedger: LedgerContextValue['clearLedger'] = useCallback(
    () =>
      run(async () => {
        const loc = requireLoc()
        const id = loc.spreadsheetId
        const now = new Date()
        // Trash first, as for a single delete: a failed removal leaves the rows in both places, never lost
        const trashed = [...transactions.map((t) => transactionToTrash(t, now)), ...accounts.map((a) => accountToTrash(a, now))]
        if (trashed.length) await client.appendTrash(id, trashed)
        if (transactions.length) await client.deleteRows(id, TX_SHEET, transactions.map((t) => ({ row: t.row, id: t.id })))
        if (accounts.length) await client.deleteRows(id, ACCOUNT_SHEET, accounts.map((a) => ({ row: a.row, id: a.id })))
        if (goals.length) await client.deleteRows(id, GOAL_SHEET, goals.map((g) => ({ row: g.row, id: g.id })))
        if (budgets.length) await client.deleteRows(id, BUDGET_SHEET, budgets.map((b) => ({ row: b.row, id: b.category })))
        await load(loc)
      }),
    [run, client, load, transactions, accounts, goals, budgets],
  )

  const eraseFromTrash: LedgerContextValue['eraseFromTrash'] = useCallback(
    (item) =>
      run(async () => {
        const loc = requireLoc()
        await client.deleteRow(loc.spreadsheetId, TRASH_SHEET, item.row ?? 0, item.id)
        await load(loc)
      }),
    [run, client, load],
  )

  const createReportDoc: LedgerContextValue['createReportDoc'] = useCallback(
    (name, html) =>
      run(async () => {
        const loc = requireLoc()
        const doc = await client.createDocFromHtml(loc.documentsFolderId || loc.folderId, name, html)
        return doc.webViewLink
      }),
    [run, client],
  )

  const uploadDocuments: LedgerContextValue['uploadDocuments'] = useCallback(
    (drafts, transactionId) =>
      run(async () => {
        const loc = requireLoc()
        const docs = await uploadDrafts(loc, drafts, transactionId ? [transactionId] : [])
        if (transactionId) {
          const tx = transactions.find((t) => t.id === transactionId)
          if (tx) await client.updateTransaction(loc.spreadsheetId, { ...tx, documentIds: [...tx.documentIds, ...docs.map((d) => d.id)] })
        }
        await load(loc)
        return docs
      }),
    [run, uploadDrafts, transactions, client, load],
  )

  const deleteDocumentRecord: LedgerContextValue['deleteDocumentRecord'] = useCallback(
    (d) =>
      run(async () => {
        const loc = requireLoc()
        await client.appendTrash(loc.spreadsheetId, [documentToTrash(d, new Date())])
        await client.deleteRow(loc.spreadsheetId, DOC_SHEET, d.row ?? 0, d.id)
        await load(loc)
      }),
    [run, client, load],
  )

  const saveAccount: LedgerContextValue['saveAccount'] = useCallback(
    (draft, existing) =>
      run(async () => {
        const loc = requireLoc()
        const id = loc.spreadsheetId
        const account: Account = existing ? { ...existing, ...draft } : { ...draft, id: newAccountId(), createdAt: new Date().toISOString() }
        if (existing) await client.updateAccount(id, account)
        else await client.appendAccounts(id, [account])
        if (!existing || existing.balance !== account.balance || existing.asOf !== account.asOf) {
          await client.appendBalances(id, [{ accountId: account.id, date: account.asOf || todayIso(), balance: account.balance, recordedAt: new Date().toISOString() }])
        }
        await load(loc)
        return account
      }),
    [run, client, load],
  )

  const deleteAccount: LedgerContextValue['deleteAccount'] = useCallback(
    (a) =>
      run(async () => {
        const loc = requireLoc()
        // Trash first. Balance history stays in the sheet, so restoring brings it back with the account
        await client.appendTrash(loc.spreadsheetId, [accountToTrash(a, new Date())])
        await client.deleteRow(loc.spreadsheetId, ACCOUNT_SHEET, a.row ?? 0, a.id)
        await load(loc)
      }),
    [run, client, load],
  )

  const saveGoal: LedgerContextValue['saveGoal'] = useCallback(
    (draft, existing) =>
      run(async () => {
        const loc = requireLoc()
        const goal: Goal = existing ? { ...existing, ...draft } : { ...draft, id: newGoalId(), createdAt: new Date().toISOString() }
        if (existing) await client.updateGoal(loc.spreadsheetId, goal)
        else await client.appendGoals(loc.spreadsheetId, [goal])
        await load(loc)
        return goal
      }),
    [run, client, load],
  )

  const saveBudget: LedgerContextValue['saveBudget'] = useCallback(
    (draft, existing) =>
      run(async () => {
        const loc = requireLoc()
        const budget: Budget = { ...draft, createdAt: existing?.createdAt || new Date().toISOString(), row: existing?.row }
        if (existing) await client.updateBudget(loc.spreadsheetId, budget)
        else await client.appendBudgets(loc.spreadsheetId, [budget])
        await load(loc)
        return budget
      }),
    [run, client, load],
  )

  const saveProfile: LedgerContextValue['saveProfile'] = useCallback(
    (update) =>
      run(async () => {
        const loc = requireLoc()
        const merged = mergeProfile(rowsToProfile(profileRows), update)
        await client.saveProfile(loc.spreadsheetId, profileToRows(merged, new Date().toISOString()), profileRows)
        await load(loc)
        // Return what the sheet holds now (read back), so callers can check it against what they meant to save
        const back = rowsToProfile(await client.listProfile(loc.spreadsheetId))
        if (!back) throw new Error('Your profile could not be read back from your Ledger. Please try again.')
        return back
      }),
    [run, client, load, profileRows],
  )

  const setAnalysisStatus: LedgerContextValue['setAnalysisStatus'] = useCallback(
    (a, status) =>
      run(async () => {
        const loc = requireLoc()
        await client.updateAnalysis(loc.spreadsheetId, { ...a, status })
        await load(loc)
      }),
    [run, client, load],
  )

  const deleteBudget: LedgerContextValue['deleteBudget'] = useCallback(
    (b) =>
      run(async () => {
        const loc = requireLoc()
        await client.deleteRow(loc.spreadsheetId, BUDGET_SHEET, b.row ?? 0, b.category)
        await load(loc)
      }),
    [run, client, load],
  )

  const deleteGoal: LedgerContextValue['deleteGoal'] = useCallback(
    (g) =>
      run(async () => {
        const loc = requireLoc()
        await client.deleteRow(loc.spreadsheetId, GOAL_SHEET, g.row ?? 0, g.id)
        await load(loc)
      }),
    [run, client, load],
  )

  const value: LedgerContextValue = {
    status,
    error,
    location,
    transactions,
    documents,
    accounts,
    balances,
    goals,
    budgets,
    analysis,
    profile,
    busy,
    connect,
    reconnect,
    refresh,
    disconnect,
    addTransaction,
    updateTransaction,
    updateTransactions,
    importTransactions,
    deleteTransaction,
    uploadDocuments,
    deleteDocumentRecord,
    trash,
    undoImport,
    clearLedger,
    clearDismissedAnalysis,
    restoreFromTrash,
    eraseFromTrash,
    saveAccount,
    deleteAccount,
    saveGoal,
    deleteGoal,
    saveBudget,
    deleteBudget,
    setAnalysisStatus,
    saveProfile,
    clearError: () => setError(null),
    createReportDoc,
  }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider')
  return ctx
}
