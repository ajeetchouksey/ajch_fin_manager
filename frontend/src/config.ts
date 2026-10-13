/**
 * Feature flags.
 *
 * AI (Gemini onboarding chat) is ON HOLD. All AI code is kept; it is only hidden.
 * To turn it back on: set VITE_ENABLE_AI=true in frontend/.env.production, add the
 * GEMINI_API_KEY Worker secret (see the project doc "Keys & secrets"), and redeploy.
 */
export const AI_ENABLED = import.meta.env.VITE_ENABLE_AI === 'true'
