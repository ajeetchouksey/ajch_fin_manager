import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { DashboardPage } from './pages/DashboardPage'
import { AccountsPage, GoalsPage } from './pages/PortfolioPages'
import { InsightsPage } from './pages/InsightsPage'
import { TaxPage } from './pages/TaxPage'
import { ReportPage } from './pages/ReportPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { TrashPage } from './pages/TrashPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { StoragePage } from './pages/StoragePage'
import { LedgerProvider } from './context/LedgerContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { SetupProvider } from './context/SetupContext'
import { useTheme } from './hooks/useTheme'

function AppShell() {
  return (
    <ProtectedRoute>
      {/* The profile lives in the Ledger, so setup sits inside the Ledger provider */}
      <LedgerProvider>
        <SetupProvider>
          <Layout>
            <Outlet />
          </Layout>
        </SetupProvider>
      </LedgerProvider>
    </ProtectedRoute>
  )
}

function App() {
  // Keeps <html data-theme> in step with the user's choice and, for "System", the device setting
  useTheme()
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/tax" element={<TaxPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/settings/storage" element={<StoragePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
