/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  /** "true" enables the AI onboarding chat (on hold by default) */
  readonly VITE_ENABLE_AI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
