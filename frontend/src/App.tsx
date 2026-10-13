import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { DashboardPage } from './pages/DashboardPage'
import { AccountsPage, GoalsPage, TransactionsPage } from './pages/SectionPages'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { SetupProvider } from './context/SetupContext'

function AppShell() {
  return (
    <ProtectedRoute>
      <SetupProvider>
        <Layout>
          <Outlet />
        </Layout>
      </SetupProvider>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
