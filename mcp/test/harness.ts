/**
 * Test-only Worker: serves the real MCP tools with a signed-in user injected and Google replaced
 * by an in-memory fake, so every tool can be called end to end with `wrangler dev`.
 * Never deployed (see wrangler.test.jsonc).
 */

import { createMcpHandler } from 'agents/mcp'
import { buildServer } from '../src/tools'
import { FakeGoogle } from './fake-google'

const google = new FakeGoogle()
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return /googleapis\.com/.test(href) ? google.fetch(input, init) : realFetch(input, init)
}) as typeof fetch

const handler = createMcpHandler(buildServer, { route: '/mcp' })

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname === '/_calls') return Response.json(google.calls.splice(0))
    // Test-only: put rows straight into a tab, for data the tools cannot write (plans, holdings, trades, profile)
    if (url.pathname === '/_seed' && request.method === 'POST') {
      const { tab, rows } = (await request.json()) as { tab: string; rows: unknown[][] }
      const t = google.sheets.get(tab)
      if (!t) return Response.json({ error: `no tab ${tab}` }, { status: 404 })
      t.rows.push(...rows)
      return Response.json({ ok: true, rows: t.rows.length })
    }
    const scope = url.searchParams.get('readonly') ? ['ledger:read'] : ['ledger:read', 'ledger:write']
    // What the OAuth provider would put on ctx.props for a signed-in user
    const props = { userId: 'u1', email: 'test@example.com', scope, googleAccessToken: 'fake-token' }
    const withProps = { waitUntil: ctx.waitUntil.bind(ctx), passThroughOnException: ctx.passThroughOnException.bind(ctx), props } as unknown as ExecutionContext
    return handler(request, env, withProps)
  },
}
