import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import './App.css'

// Dashboard with AaryaAI Branding
function Dashboard() {
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--aarya-bg)',
      color: '#cbd5e1',
    }}>
      {/* Sidebar */}
      <div style={{
        width: '200px',
        padding: '20px',
        borderRight: '1px solid rgba(56, 189, 248, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '32px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #38bdf8 100%)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: 'white',
            fontSize: '20px',
          }}>Ⓐ</div>
          <div style={{ fontSize: '12px', fontWeight: '600', lineHeight: '1.2' }}>
            <div>AARYA I</div>
            <div style={{ color: '#7c3aed' }}>FINANCE</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        padding: '40px',
      }}>
        <div style={{
          maxWidth: '1200px',
        }}>
          <h1 style={{
            fontSize: '32px',
            color: '#f1f5f9',
            marginBottom: '12px',
          }}>Dashboard</h1>
          <p style={{
            color: '#94a3b8',
            marginBottom: '40px',
          }}>Dashboard will be implemented in Phase 2.3</p>

          {/* Placeholder Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
          }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '12px',
                padding: '24px',
                backdropFilter: 'blur(10px)',
                minHeight: '150px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  background: 'rgba(124, 58, 237, 0.2)',
                  borderRadius: '8px',
                  marginBottom: '12px',
                }}></div>
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                  Placeholder {i}
                </div>
                <div style={{
                  fontSize: '24px',
                  fontWeight: '600',
                  color: '#f1f5f9',
                  marginTop: '8px',
                }}>—</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
