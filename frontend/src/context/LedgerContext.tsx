import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { clearDriveToken, getStoredDriveToken, requestDriveToken } from '../lib/google/gis'
import { DOC_SHEET, DriveError, LedgerClient, TX_SHEET } from '../lib/google/driveClient'
import { newId, type LedgerDocument, type LedgerLocation, type Transaction } from '../lib/ledger/types'

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

interface LedgerContextValue {
  status: LedgerStatus
  error: string | null
  location: LedgerLocation | null
  transactions: Transaction[]
  documents: LedgerDocument[]
  busy: boolean
  connect: (folderName: string) => Promise<void>
  reconnect: () => Promise<void>
  refresh: () => Promise<void>
  disconnect: () => void
  addTransaction: (t: Omit<Transaction, 'id' | 'createdAt' | 'documentIds' | 'source'>, attachments: DocumentDraft[]) => Promise<Transaction>
  updateTransaction: (t: Transaction) => Promise<void>
  importTransactions: (rows: Array<Omit<Transaction, 'id' | 'createdAt' | 'documentIds' | 'source'>>) => Promise<number>
  deleteTransaction: (t: Transaction) => Promise<void>
  uploadDocuments: (drafts: DocumentDraft[], transactionId?: string) => Promise<LedgerDocument[]>
  deleteDocumentRecord: (d: LedgerDocument) => Promise<void>
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

  const load = useCallback(
    async (loc: LedgerLocation) => {
      const [tx, docs] = await Promise.all([client.listTransactions(loc.spreadsheetId), client.listDocuments(loc.spreadsheetId)])
      setTransactions(tx)
      setDocuments(docs)
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
        await client.deleteRow(loc.spreadsheetId, TX_SHEET, t.row ?? 0, t.id)
        await load(loc)
      }),
    [run, client, load],
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
        await client.deleteRow(loc.spreadsheetId, DOC_SHEET, d.row ?? 0, d.id)
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
    busy,
    connect,
    reconnect,
    refresh,
    disconnect,
    addTransaction,
    updateTransaction,
    importTransactions,
    deleteTransaction,
    uploadDocuments,
    deleteDocumentRecord,
    clearError: () => setError(null),
  }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider')
  return ctx
}
