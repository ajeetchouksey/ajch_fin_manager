import React, { createContext, useState, useEffect, useCallback } from 'react'
import type { User, AuthContextType } from '../types/index'
import {
  saveAuthData,
  loadAuthData,
  clearAuthData,
  getUserProfile,
} from '../utils/oauth'
import { SESSION_EXPIRED_EVENT } from '../utils/session'

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize auth from localStorage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const authData = loadAuthData()
        if (authData && authData.accessToken) {
          // Verify token is still valid by fetching user profile
          const profile = await getUserProfile(authData.accessToken)
          const userData: User = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            accessToken: authData.accessToken,
          }
          setUser(userData)
        }
      } catch (err) {
        console.error('Failed to initialize auth:', err)
        clearAuthData()
        setError('Session expired. Please log in again.')
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const login = useCallback(async (accessToken: string) => {
    try {
      setLoading(true)
      setError(null)

      // Fetch user profile from Google
      const profile = await getUserProfile(accessToken)

      const userData: User = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken,
      }

      // Save to localStorage
      saveAuthData({ accessToken, user: userData })
      setUser(userData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to login'
      setError(message)
      clearAuthData()
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    clearAuthData()
    setError(null)
  }, [])

  // The API answered 401: Google token expired or was revoked — sign out cleanly
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      clearAuthData()
      setError('Your session has expired. Please sign in again.')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const value: AuthContextType = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
