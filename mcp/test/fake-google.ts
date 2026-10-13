/**
 * In-memory stand-in for the parts of the Google Drive and Sheets REST APIs the Ledger client uses.
 * Test-only: lets the MCP tools run end to end without a Google account.
 */

type Grid = unknown[][]

interface FakeFile {
  id: string
  name: string
  kind: string
  parents?: string[]
}

export class FakeGoogle {
  files: FakeFile[] = []
  sheets = new Map<string, { id: number; title: string; rows: Grid }>()
  calls: string[] = []
  private nextId = 1

  private json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  }

  private tab(title: string) {
    const t = this.sheets.get(title)
    if (!t) throw new Error(`no tab ${title}`)
    return t
  }

  /** A1 range like "Transactions!A5:M5" or "Transactions!A:A" or "Transactions" → [tab, firstRow (1-based) | null] */
  private parseRange(range: string): [string, number | null, boolean] {
    const [title, cells] = decodeURIComponent(range).split('!')
    if (!cells) return [title, null, false]
    const m = /^A(\d+)?/.exec(cells)
    const colOnly = /^A:A$/.test(cells)
    return [title, m?.[1] ? Number(m[1]) : null, colOnly]
  }

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    this.calls.push(`${method} ${url.pathname}`)
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined

    // Drive: find by appProperties / create
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/drive/v3/files') {
      if (method === 'GET') {
        const kind = /value='([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1]
        return this.json({ files: this.files.filter((f) => f.kind === kind).map((f) => ({ id: f.id, name: f.name, webViewLink: `https://drive.example/${f.id}`, parents: f.parents })) })
      }
      const file: FakeFile = { id: `file${this.nextId++}`, name: body.name, kind: body.appProperties.aaryaKind, parents: body.parents }
      this.files.push(file)
      if (file.kind === 'ledger') this.sheets.set('Sheet1', { id: 0, title: 'Sheet1', rows: [] })
      return this.json({ id: file.id, name: file.name, webViewLink: `https://drive.example/${file.id}` })
    }

    // Sheets
    const m = /^\/v4\/spreadsheets\/[^/:]+(.*)$/.exec(url.pathname)
    if (url.hostname === 'sheets.googleapis.com' && m) {
      const rest = m[1]
      if (rest === '' && method === 'GET') {
        return this.json({ sheets: [...this.sheets.values()].map((s) => ({ properties: { sheetId: s.id, title: s.title } })) })
      }
      if (rest === ':batchUpdate') {
        for (const r of body.requests) {
          if (r.addSheet) this.sheets.set(r.addSheet.properties.title, { id: r.addSheet.properties.sheetId, title: r.addSheet.properties.title, rows: [] })
          if (r.updateSheetProperties) {
            const old = [...this.sheets.values()].find((s) => s.id === r.updateSheetProperties.properties.sheetId)!
            this.sheets.delete(old.title)
            old.title = r.updateSheetProperties.properties.title
            this.sheets.set(old.title, old)
          }
          if (r.deleteDimension) {
            const t = [...this.sheets.values()].find((s) => s.id === r.deleteDimension.range.sheetId)!
            t.rows.splice(r.deleteDimension.range.startIndex, 1)
          }
        }
        return this.json({})
      }
      if (rest === '/values:batchUpdate') {
        for (const d of body.data) {
          const [title, row] = this.parseRange(d.range)
          const t = this.tab(title)
          d.values.forEach((v: unknown[], i: number) => (t.rows[(row ?? 1) - 1 + i] = v))
        }
        return this.json({})
      }
      const vm = /^\/values\/([^:]+)(:append)?$/.exec(rest)
      if (vm) {
        const [title, row, colOnly] = this.parseRange(vm[1])
        const t = this.tab(title)
        if (vm[2]) {
          t.rows.push(...body.values)
          return this.json({})
        }
        if (method === 'PUT') {
          t.rows[row! - 1] = body.values[0]
          return this.json({})
        }
        if (colOnly) return this.json({ values: t.rows.map((r) => [r[0]]) })
        if (row) return this.json({ values: t.rows[row - 1] ? [[t.rows[row - 1][0]]] : [] })
        return this.json({ values: t.rows })
      }
    }
    return this.json({ error: { message: `fake google: unhandled ${method} ${url}` } }, 500)
  }
}
