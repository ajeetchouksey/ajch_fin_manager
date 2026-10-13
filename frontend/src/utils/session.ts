/** Fired when the API rejects our Google token (expired or revoked). AuthContext signs the user out. */
export const SESSION_EXPIRED_EVENT = 'aarya:session-expired'

export function reportSessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

/** Call after any fetch to our API; returns true when the session has expired. */
export function isSessionExpired(res: Response): boolean {
  if (res.status === 401) {
    reportSessionExpired()
    return true
  }
  return false
}
