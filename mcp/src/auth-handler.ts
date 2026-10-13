/**
 * The connector's own pages: the landing page, the consent page shown when an AI app asks to
 * connect, and the Google sign-in round trip. Follows the confused-deputy protections of the MCP
 * spec via the OAuth library's consent and upstream helpers (browser-bound, single-use, unframeable).
 */

import { AuthorizationError, CimdFetchError, authorizationErrorRedirect, type ConsentDescription, type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { exchangeGoogleCode, googleAuthorizeUrl, googleUser, s256, GOOGLE_SCOPES } from './google'
import { SCOPE_READ, SCOPE_WRITE, type Env, type GrantProps } from './types'

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const STYLE = `
:root{color-scheme:dark;--bg:#0e1a2d;--card:#16223a;--line:rgba(148,163,184,.22);--text:#e2e8f0;--muted:#94a3b8;--brand:#5b4bd6;--soft:#a99bff;--warn:#fcd34d}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:16px}
main{width:100%;max-width:520px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}
h1{font-size:24px;line-height:1.2;margin:0 0 6px}p{margin:8px 0;color:var(--muted)}strong{color:var(--text)}
.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);font-weight:600}
ul{padding-left:20px;color:var(--muted)}li{margin:4px 0}
label.opt{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--line);border-radius:12px;margin:8px 0;color:var(--text)}
label.opt input{margin-top:4px;width:18px;height:18px;accent-color:var(--brand)}label.opt span small{display:block;color:var(--muted)}
.warn{border:1px solid rgba(252,211,77,.4);background:rgba(252,211,77,.08);border-radius:12px;padding:10px 12px;color:#fde68a}
.row{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}
button{font:inherit;font-weight:600;border-radius:12px;padding:10px 18px;border:1px solid var(--line);background:transparent;color:var(--text);cursor:pointer;min-height:44px}
button.primary{background:var(--brand);border-color:var(--brand);color:#fff}
code{background:rgba(148,163,184,.12);padding:2px 6px;border-radius:6px;color:var(--text);word-break:break-all}`

function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`, { status, headers })
}

function errorPage(message: string, status = 400) {
  return page('FinBuddy connector', `<p class="eyebrow">FinBuddy</p><h1>Couldn’t connect</h1><p>${escape(message)}</p><p>Go back to your AI app and start connecting again.</p>`, status)
}

function consentPage(d: ConsentDescription, handle: string): string {
  const name = escape(d.clientName)
  const origin = d.clientDomain ? `Published by <strong>${escape(d.clientDomain)}</strong>.` : 'This app registered itself, so its name is not verified.'
  const wantsWrite = d.scope.includes(SCOPE_WRITE)
  return `<p class="eyebrow">FinBuddy</p>
<h1>Let ${name} use your FinBuddy Ledger?</h1>
<p>${origin} Access will be sent to <strong>${escape(d.redirectHost)}</strong>.</p>
${d.redirectIsLoopback ? '<p class="warn">This sends access to an app running on your computer. Continue only if you just started connecting from it.</p>' : ''}
<p>After you allow it, you sign in with Google. ${name} can then work only with the FinBuddy folder and Ledger in your Google Drive, never with your other files.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <input type="hidden" name="scope" value="${SCOPE_READ}">
  <label class="opt"><input type="checkbox" checked disabled><span>Read your Ledger<small>Transactions, accounts, goals and your financial review</small></span></label>
  ${wantsWrite ? `<label class="opt"><input type="checkbox" name="scope" value="${SCOPE_WRITE}" checked><span>Make changes<small>Add, edit and delete transactions, import statements, update accounts and goals. Untick to connect read-only.</small></span></label>` : ''}
  <p>What ${name} reads is sent to that app to answer you. FinBuddy does not keep a copy. You can disconnect at any time in the app or at myaccount.google.com/connections.</p>
  <div class="row"><button name="decision" value="deny">Deny</button><button class="primary" name="decision" value="approve">Allow and sign in with Google</button></div>
</form>`
}

function landingPage(origin: string): Response {
  const url = `${origin}/mcp`
  return page(
    'FinBuddy connector',
    `<p class="eyebrow">FinBuddy</p><h1>Use your Ledger from your AI app</h1>
<p>Add FinBuddy to Claude, ChatGPT or any app that supports MCP connectors. Then ask it to import a statement, add a payment, explain your spending or review your finances.</p>
<p>Connector URL:</p><p><code>${escape(url)}</code></p>
<ul><li><strong>Claude</strong>: Settings → Connectors → Add custom connector, paste the URL.</li>
<li><strong>ChatGPT</strong>: Settings → Apps &amp; Connectors → Create, paste the URL.</li>
<li>Other apps: add a remote MCP server with this URL.</li></ul>
<p>You sign in with Google once. FinBuddy only ever sees the files it created in your Drive.</p>`,
  )
}

interface UpstreamData {
  verifier: string
}

export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const oauth: OAuthHelpers = env.OAUTH_PROVIDER
    // From config, not the Host header: Google needs the exact redirect URI registered for the client
    const origin = env.PUBLIC_URL.replace(/\/+$/, '')
    const callbackUrl = `${origin}/callback`
    try {
      if (url.pathname === '/' && request.method === 'GET') return landingPage(origin)

      if (url.pathname === '/authorize' && request.method === 'GET') {
        const authRequest = await oauth.parseAuthRequest(request)
        const details = await oauth.describeConsent(authRequest)
        const consent = await oauth.beginConsent(authRequest)
        return page(`Connect ${details.clientName} to FinBuddy`, consentPage(details, consent.handle), 200, consent.headers)
      }

      if (url.pathname === '/authorize' && request.method === 'POST') {
        const form = await request.formData()
        const handle = String(form.get('handle') ?? '')
        if (form.get('decision') !== 'approve') {
          const denied = await oauth.denyConsent(request, handle)
          return new Response(null, { status: 302, headers: denied.headers })
        }
        // Reading is always included; writing only if ticked
        const scope = Array.from(new Set([SCOPE_READ, ...form.getAll('scope').map(String).filter((s) => s === SCOPE_WRITE)]))
        const approved = await oauth.approveConsent(request, handle, { scope })
        const verifier = crypto.randomUUID() + crypto.randomUUID()
        const { state, headers } = await oauth.beginUpstream(approved.request, { data: { verifier } satisfies UpstreamData, headers: approved.headers })
        headers.set('Location', googleAuthorizeUrl(env, { redirectUri: callbackUrl, state, codeChallenge: await s256(verifier) }))
        return new Response(null, { status: 302, headers })
      }

      if (url.pathname === '/callback' && request.method === 'GET') {
        const { request: original, data, headers } = await oauth.finishUpstream<UpstreamData>(request)
        const code = url.searchParams.get('code')
        if (url.searchParams.get('error') || !code) {
          headers.set('Location', authorizationErrorRedirect(original, 'access_denied'))
          return new Response(null, { status: 302, headers })
        }
        const google = await exchangeGoogleCode(env, code, data.verifier, callbackUrl)
        const granted = google.scope.split(' ')
        if (!GOOGLE_SCOPES.slice(2).every((s) => granted.includes(s))) {
          return errorPage('FinBuddy needs permission to use the files it creates in your Google Drive. Please connect again and tick the Google Drive box on Google’s screen.')
        }
        if (!google.refreshToken) {
          return errorPage('Google did not allow FinBuddy to stay connected. Please connect again.')
        }
        const user = await googleUser(google.accessToken)
        const props: GrantProps = {
          userId: user.id,
          email: user.email,
          scope: original.scope,
          googleRefreshToken: google.refreshToken,
          googleAccessToken: google.accessToken,
          googleExpiresIn: google.expiresIn,
        }
        const { redirectTo } = await oauth.completeAuthorization({
          request: original,
          userId: encodeURIComponent(user.id),
          metadata: { label: user.email },
          scope: original.scope,
          props,
        })
        headers.set('Location', redirectTo)
        return new Response(null, { status: 302, headers })
      }

      return new Response('Not found', { status: 404 })
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302)
      if (error instanceof AuthorizationError) return errorPage(error.description || 'This sign-in link expired or was already used.')
      if (error instanceof CimdFetchError) return errorPage('This app could not be verified.')
      throw error
    }
  },
}
