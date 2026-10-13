/**
 * Minimal Google Drive + Sheets REST client used by the Ledger (runs in the browser).
 * Files are found again by `appProperties` (aaryaKind), so nothing about them needs to be
 * stored on our server. All writes use valueInputOption=RAW so imported text can never be
 * turned into a spreadsheet formula (CSV/formula injection).
 */

import {
  CONTRACT_VERSION,
  DOCUMENT_COLUMNS,
  TRANSACTION_COLUMNS,
  documentToRow,
  rowToDocument,
  rowToTransaction,
  transactionToRow,
  type LedgerDocument,
  type LedgerLocation,
  type Transaction,
} from '../ledger/types'
import {
  ACCOUNT_COLUMNS,
  BALANCE_COLUMNS,
  GOAL_COLUMNS,
  accountToRow,
  balanceToRow,
  goalToRow,
  rowToAccount,
  rowToBalance,
  rowToGoal,
  type Account,
  type BalanceEntry,
  type Goal,
} from '../ledger/portfolio'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'

export const TX_SHEET = 'Transactions'
export const DOC_SHEET = 'Documents'
export const ACCOUNT_SHEET = 'Accounts'
export const BALANCE_SHEET = 'Balances'
export const GOAL_SHEET = 'Goals'
const META_SHEET = 'Meta'

/** Tabs with a header row, created when missing (in this order, after Transactions). */
const DATA_TABS: Array<[string, readonly string[]]> = [
  [DOC_SHEET, DOCUMENT_COLUMNS],
  [ACCOUNT_SHEET, ACCOUNT_COLUMNS],
  [BALANCE_SHEET, BALANCE_COLUMNS],
  [GOAL_SHEET, GOAL_COLUMNS],
]

type RowSheet = typeof TX_SHEET | typeof DOC_SHEET | typeof ACCOUNT_SHEET | typeof GOAL_SHEET

/** Last column letter for a table of n columns (n ≤ 26). */
const lastCol = (n: number) => String.fromCharCode(64 + n)

export class DriveError extends Error {
  status: number
  reason?: string
  constructor(message: string, status: number, reason?: string) {
    super(message)
    this.name = 'DriveError'
    this.status = status
    this.reason = reason
  }
}

type TokenGetter = () => Promise<string>

function friendly(status: number, reason: string | undefined, raw: string): string {
  if (status === 401) return 'Your Google Drive connection expired. Please reconnect.'
  if (reason === 'accessNotConfigured' || /has not been used in project|is disabled/i.test(raw))
    return raw.includes('sheets') || raw.includes('Sheets')
      ? 'The Google Sheets API is not enabled for this app yet (Google Cloud console → APIs & Services → enable "Google Sheets API").'
      : 'The Google Drive API is not enabled for this app yet (Google Cloud console → APIs & Services → enable "Google Drive API").'
  if (status === 403) return "Google Drive refused the request. Reconnect Drive and make sure the app's permission is ticked."
  if (status === 404) return 'A Ledger file could not be found in your Drive. It may have been deleted or moved to the bin.'
  if (status === 429 || status >= 500) return 'Google is busy right now. Please try again in a moment.'
  return 'Google Drive returned an error. Please try again.'
}

export class LedgerClient {
  private getToken: TokenGetter
  constructor(getToken: TokenGetter) {
    this.getToken = getToken
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken()
    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
      })
    } catch {
      throw new DriveError("Couldn't reach Google Drive. Check your internet connection.", 0)
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      let reason: string | undefined
      try {
        reason = JSON.parse(raw)?.error?.errors?.[0]?.reason ?? JSON.parse(raw)?.error?.status
      } catch {
        /* not JSON */
      }
      throw new DriveError(friendly(res.status, reason, raw), res.status, reason)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  // ---------- locating / creating the Ledger ----------

  private async findByKind(kind: string): Promise<{ id: string; name: string; webViewLink?: string; parents?: string[] } | null> {
    const q = `appProperties has { key='aaryaKind' and value='${kind}' } and trashed=false`
    const data = await this.call<{ files: Array<{ id: string; name: string; webViewLink?: string; parents?: string[] }> }>(
      `${DRIVE}/files?${new URLSearchParams({ q, spaces: 'drive', fields: 'files(id,name,webViewLink,parents)', pageSize: '5', orderBy: 'createdTime' })}`,
    )
    return data.files?.[0] ?? null
  }

  private async createFile(meta: Record<string, unknown>): Promise<{ id: string; name: string; webViewLink?: string }> {
    return this.call(`${DRIVE}/files?fields=id,name,webViewLink`, { method: 'POST', body: JSON.stringify(meta) })
  }

  /** Returns the existing Ledger if this app already created one in the user's Drive. */
  async find(): Promise<LedgerLocation | null> {
    const [folder, ledger, docs] = await Promise.all([this.findByKind('root'), this.findByKind('ledger'), this.findByKind('documents')])
    if (!ledger) return null
    await this.initialiseSheet(ledger.id)
    return {
      folderId: folder?.id ?? ledger.parents?.[0] ?? '',
      folderName: folder?.name ?? 'AaryaAI Finance',
      folderLink: folder?.webViewLink ?? '',
      documentsFolderId: docs?.id ?? folder?.id ?? '',
      spreadsheetId: ledger.id,
      spreadsheetLink: ledger.webViewLink ?? `https://docs.google.com/spreadsheets/d/${ledger.id}/edit`,
    }
  }

  /** Create the folder, Documents sub-folder and Ledger Sheet (idempotent per kind). */
  async create(folderName: string): Promise<LedgerLocation> {
    const name = folderName.trim().slice(0, 80) || 'AaryaAI Finance'
    const folder =
      (await this.findByKind('root')) ??
      (await this.createFile({ name, mimeType: FOLDER_MIME, appProperties: { aaryaKind: 'root' } }))
    const docs =
      (await this.findByKind('documents')) ??
      (await this.createFile({ name: 'Documents', mimeType: FOLDER_MIME, parents: [folder.id], appProperties: { aaryaKind: 'documents' } }))
    let ledger = await this.findByKind('ledger')
    if (!ledger) {
      ledger = await this.createFile({
        name: 'Ledger',
        mimeType: SHEET_MIME,
        parents: [folder.id],
        appProperties: { aaryaKind: 'ledger', aaryaContract: CONTRACT_VERSION },
      })
    }
    await this.initialiseSheet(ledger.id)
    return {
      folderId: folder.id,
      folderName: folder.name,
      folderLink: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`,
      documentsFolderId: docs.id,
      spreadsheetId: ledger.id,
      spreadsheetLink: ledger.webViewLink ?? `https://docs.google.com/spreadsheets/d/${ledger.id}/edit`,
    }
  }

  /**
   * Makes sure the Ledger has all its tabs (Transactions, Documents, Accounts, Balances, Goals, Meta) with headers.
   * Only adds what is missing, so it is safe to run on every connect. This repairs a Ledger
   * whose first setup stopped partway (for example, while the Sheets API was not enabled).
   */
  async initialiseSheet(spreadsheetId: string) {
    const info = await this.call<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>(
      `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    )
    const have = new Map(info.sheets.map((s) => [s.properties.title, s.properties.sheetId]))
    let nextId = Math.max(0, ...info.sheets.map((s) => s.properties.sheetId)) + 1
    const header = (sheetId: number, n: number) => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: n },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.92, blue: 0.99 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    })
    const requests: unknown[] = []
    const data: Array<{ range: string; values: unknown[][] }> = []
    // A new spreadsheet comes with one default tab ("Sheet1"); reuse it as Transactions rather than leave it behind.
    const defaultTab = info.sheets.length === 1 && ![TX_SHEET, DOC_SHEET, META_SHEET].includes(info.sheets[0].properties.title) ? info.sheets[0].properties.sheetId : null
    if (!have.has(TX_SHEET) && defaultTab !== null) {
      requests.push(
        { updateSheetProperties: { properties: { sheetId: defaultTab, title: TX_SHEET, gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } },
        header(defaultTab, TRANSACTION_COLUMNS.length),
      )
      data.push({ range: `${TX_SHEET}!A1`, values: [Array.from(TRANSACTION_COLUMNS)] })
    } else if (!have.has(TX_SHEET)) {
      const sheetId = nextId++
      requests.push({ addSheet: { properties: { sheetId, title: TX_SHEET, gridProperties: { frozenRowCount: 1 } } } }, header(sheetId, TRANSACTION_COLUMNS.length))
      data.push({ range: `${TX_SHEET}!A1`, values: [Array.from(TRANSACTION_COLUMNS)] })
    }
    for (const [title, columns] of DATA_TABS) {
      if (have.has(title)) continue
      const sheetId = nextId++
      requests.push({ addSheet: { properties: { sheetId, title, gridProperties: { frozenRowCount: 1 } } } }, header(sheetId, columns.length))
      data.push({ range: `${title}!A1`, values: [Array.from(columns)] })
    }
    if (!have.has(META_SHEET)) {
      requests.push({ addSheet: { properties: { sheetId: nextId++, title: META_SHEET } } })
      data.push({
        range: `${META_SHEET}!A1`,
        values: [
          ['key', 'value'],
          ['contract_version', CONTRACT_VERSION],
          ['created_by', 'AaryaAI Finance'],
          ['created_at', new Date().toISOString()],
          ['note', 'Edit rows freely. Keep the header row and column order; the app reads them.'],
        ],
      })
    }
    if (requests.length === 0) return
    await this.call(`${SHEETS}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })
    await this.call(`${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    })
  }

  // ---------- reading ----------

  async listTransactions(spreadsheetId: string): Promise<Transaction[]> {
    const data = await this.call<{ values?: unknown[][] }>(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(TX_SHEET)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    )
    // Row 1 is the header; values[i] is sheet row i + 1.
    return (data.values ?? []).slice(1).map((r, i) => rowToTransaction(r, i + 2)).filter((t): t is Transaction => t !== null)
  }

  async listDocuments(spreadsheetId: string): Promise<LedgerDocument[]> {
    const data = await this.call<{ values?: unknown[][] }>(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(DOC_SHEET)}?valueRenderOption=UNFORMATTED_VALUE`,
    )
    // Row 1 is the header; values[i] is sheet row i + 1.
    return (data.values ?? []).slice(1).map((r, i) => rowToDocument(r, i + 2)).filter((d): d is LedgerDocument => d !== null)
  }

  private async readTab(spreadsheetId: string, sheet: string): Promise<unknown[][]> {
    const data = await this.call<{ values?: unknown[][] }>(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(sheet)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    )
    // Row 1 is the header; the returned array's index i is sheet row i + 2.
    return (data.values ?? []).slice(1)
  }

  async listAccounts(spreadsheetId: string): Promise<Account[]> {
    return (await this.readTab(spreadsheetId, ACCOUNT_SHEET)).map((r, i) => rowToAccount(r, i + 2)).filter((a): a is Account => a !== null)
  }

  async listBalances(spreadsheetId: string): Promise<BalanceEntry[]> {
    return (await this.readTab(spreadsheetId, BALANCE_SHEET)).map((r) => rowToBalance(r)).filter((b): b is BalanceEntry => b !== null)
  }

  async listGoals(spreadsheetId: string): Promise<Goal[]> {
    return (await this.readTab(spreadsheetId, GOAL_SHEET)).map((r, i) => rowToGoal(r, i + 2)).filter((g): g is Goal => g !== null)
  }

  // ---------- writing ----------

  private async append(spreadsheetId: string, sheet: string, values: (string | number)[][]) {
    if (!values.length) return
    await this.call(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values }) },
    )
  }

  /** Overwrite one row after checking it still holds the expected id. */
  private async replaceRow(spreadsheetId: string, sheet: string, row: number | undefined, id: string, values: (string | number)[]) {
    if (!row) throw new DriveError('This row can no longer be found. Reload and try again.', 409)
    const check = await this.call<{ values?: unknown[][] }>(`${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A${row}`)}`)
    if (String(check.values?.[0]?.[0] ?? '') !== id) throw new DriveError('The Ledger changed since it was loaded. Reload and try again.', 409)
    await this.call(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A${row}:${lastCol(values.length)}${row}`)}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [values] }) },
    )
  }

  appendAccounts = (spreadsheetId: string, rows: Account[]) => this.append(spreadsheetId, ACCOUNT_SHEET, rows.map(accountToRow))
  appendBalances = (spreadsheetId: string, rows: BalanceEntry[]) => this.append(spreadsheetId, BALANCE_SHEET, rows.map(balanceToRow))
  appendGoals = (spreadsheetId: string, rows: Goal[]) => this.append(spreadsheetId, GOAL_SHEET, rows.map(goalToRow))
  updateAccount = (spreadsheetId: string, a: Account) => this.replaceRow(spreadsheetId, ACCOUNT_SHEET, a.row, a.id, accountToRow(a))
  updateGoal = (spreadsheetId: string, g: Goal) => this.replaceRow(spreadsheetId, GOAL_SHEET, g.row, g.id, goalToRow(g))

  async appendTransactions(spreadsheetId: string, rows: Transaction[]) {
    if (!rows.length) return
    await this.call(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${TX_SHEET}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: rows.map(transactionToRow) }) },
    )
  }

  async appendDocuments(spreadsheetId: string, docs: LedgerDocument[]) {
    if (!docs.length) return
    await this.call(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${DOC_SHEET}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: docs.map(documentToRow) }) },
    )
  }

  /** Overwrite a transaction's row after checking it still holds that transaction (the Ledger may be edited elsewhere). */
  updateTransaction = (spreadsheetId: string, t: Transaction) => this.replaceRow(spreadsheetId, TX_SHEET, t.row, t.id, transactionToRow(t))

  /** The id column of a tab, so many rows can be checked with one read. Index i is sheet row i + 1. */
  private async idColumn(spreadsheetId: string, sheet: string): Promise<string[]> {
    const data = await this.call<{ values?: unknown[][] }>(`${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A:A`)}`)
    return (data.values ?? []).map((r) => String(r[0] ?? ''))
  }

  private async sheetIdOf(spreadsheetId: string, sheet: string): Promise<number> {
    const info = await this.call<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>(
      `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    )
    const sheetId = info.sheets.find((s) => s.properties.title === sheet)?.properties.sheetId
    if (sheetId === undefined) throw new DriveError(`The "${sheet}" tab is missing from your Ledger.`, 404)
    return sheetId
  }

  /** Update many transactions in one request, after checking every row still holds its transaction. */
  async updateTransactions(spreadsheetId: string, txs: Transaction[]) {
    if (!txs.length) return
    const ids = await this.idColumn(spreadsheetId, TX_SHEET)
    for (const t of txs) {
      if (!t.row || ids[t.row - 1] !== t.id) throw new DriveError('The Ledger changed since it was loaded. Reload and try again.', 409)
    }
    await this.call(`${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: txs.map((t) => ({ range: `${TX_SHEET}!A${t.row}:${lastCol(TRANSACTION_COLUMNS.length)}${t.row}`, values: [transactionToRow(t)] })),
      }),
    })
  }

  /** Delete many rows of one tab in one request, after checking each still holds the expected id. */
  async deleteRows(spreadsheetId: string, sheet: RowSheet, rows: Array<{ row?: number; id: string }>) {
    if (!rows.length) return
    const ids = await this.idColumn(spreadsheetId, sheet)
    for (const r of rows) {
      if (!r.row || ids[r.row - 1] !== r.id) throw new DriveError('The Ledger changed since it was loaded. Reload and try again.', 409)
    }
    const sheetId = await this.sheetIdOf(spreadsheetId, sheet)
    // Bottom-up, so deleting one row doesn't shift the others
    const sorted = [...new Set(rows.map((r) => r.row!))].sort((a, b) => b - a)
    await this.call(`${SHEETS}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: sorted.map((row) => ({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } })) }),
    })
  }

  /** Delete one row after checking it still holds the expected id (guards against concurrent edits). */
  async deleteRow(spreadsheetId: string, sheet: RowSheet, row: number, expectedId: string) {
    const check = await this.call<{ values?: unknown[][] }>(
      `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(`${sheet}!A${row}`)}`,
    )
    if (String(check.values?.[0]?.[0] ?? '') !== expectedId) {
      throw new DriveError('The Ledger changed since it was loaded. Reload and try again.', 409)
    }
    const info = await this.call<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }>(
      `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
    )
    const sheetId = info.sheets.find((s) => s.properties.title === sheet)?.properties.sheetId
    if (sheetId === undefined) throw new DriveError(`The "${sheet}" tab is missing from your Ledger.`, 404)
    await this.call(`${SHEETS}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }],
      }),
    })
  }

  /** Upload a file into the Documents folder (multipart; fine for receipts and statements). */
  async uploadFile(folderId: string, file: File, name?: string): Promise<{ id: string; name: string; mimeType: string; webViewLink: string }> {
    const boundary = `aarya${Math.random().toString(36).slice(2)}`
    const meta = { name: (name || file.name).slice(0, 200), parents: [folderId], appProperties: { aaryaKind: 'document' } }
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
        file,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    )
    const res = await this.call<{ id: string; name: string; mimeType: string; webViewLink?: string }>(
      `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`,
      { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } },
    )
    return { ...res, webViewLink: res.webViewLink ?? `https://drive.google.com/file/d/${res.id}/view` }
  }
}
