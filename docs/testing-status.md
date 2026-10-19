# Testing status

Last checked: 19 Oct 2026, locally, against the Worker built with `npm run build` and run with `npx wrangler dev --port 8787`.

## What runs in the nightly workflow (must pass)

| Check | Command | Result |
| --- | --- | --- |
| Worker type check | `npm run type-check` | passes |
| Worker unit tests | `npm run test:unit` (schema-delete, auth-flags, onboarding-prompts) | 47 pass |
| Frontend tests | `cd frontend && npm test` | pass |
| Frontend type check and build | `npx tsc -b`, `npm run build` | pass |

## Server tests (informational, not in the pass/fail gate)

Run `npx jest src/__tests__/security.test.ts src/__tests__/integration.test.ts src/__tests__/uat.test.ts` with the Worker on port 8787. Result: 55 pass, 23 fail.

### Failing: input validation expected before authentication

The Worker checks authentication before it checks the request body. Without a token, `/api/chat` and `/api/sync` return **401**. The tests expect **400** for bad input sent without a token. Checked directly: `POST /api/chat` with `{}` returns 401, and `POST /api/sync` with no body returns 401.

- Chat Request Validation: missing message, overly long messages, invalid provider
- Sync Request Validation: invalid scope values
- Content Type Validation: invalid content type
- Injection Attack Prevention: XSS payloads, special characters
- Integration: reject chat request without message

Decide the intended order first. Authentication first is the safer default, so the tests should probably send a valid token before checking validation.

### Failing: needs the frontend on port 5173

UAT_001 to UAT_003, Performance, Browser Compatibility, Mobile Responsiveness and the acceptance criteria tests load pages from `http://localhost:5173`. The nightly does not start the frontend, so they fail with connection errors.

### Failing: CORS

- Security: reject requests from unknown origins. Not yet checked whether the Worker sends CORS headers for unknown origins.

### Failing: needs Google OAuth

- Integration: complete OAuth authentication flow end-to-end. This needs a real Google sign-in and is not automatable in CI as written.

## End-to-end (Playwright)

`npm run test:e2e` starts `npm run dev` and the frontend. Not run in this check. It is marked `continue-on-error` in the nightly and is stale; treat it as unverified until it is re-run.
