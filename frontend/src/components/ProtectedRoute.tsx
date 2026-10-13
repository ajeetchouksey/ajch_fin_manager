import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { FullScreenStatus } from './FullScreenStatus'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <FullScreenStatus title="Loading your workspace…" />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}
