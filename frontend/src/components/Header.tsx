import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogout = async () => {
    logout()
    navigate('/login')
  }

  const getUserInitial = () => {
    if (user?.name) {
      return user.name.charAt(0).toUpperCase()
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase()
    }
    return 'U'
  }

  const getUserDisplay = () => {
    return user?.name || user?.email || 'User'
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-200 ${
        scrolled
          ? 'bg-slate-800/50 border-slate-700/60'
          : 'bg-slate-800/75 border-slate-700/30'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {/* Navigation progress bar */}
      <div className="nav-progress"></div>

      <div className="h-14 flex items-center justify-between px-4 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Logo & Branding */}
        <div className="flex items-center gap-3 min-w-fit">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, #5B4BD6 0%, #A99BFF 100%)',
            }}
          >
            Ⓐ
          </div>
          <div className="text-sm font-semibold leading-none">
            <div className="text-slate-100">AARYA</div>
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-violet-300">
              FINANCE
            </div>
          </div>
        </div>

        {/* Center Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 flex-1 justify-center mx-8">
          <a
            href="/dashboard"
            className="text-sm text-slate-300 hover:text-white transition-colors relative group"
          >
            Dashboard
            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-violet-400 to-violet-300 group-hover:w-full transition-all duration-300"></span>
          </a>
          <a
            href="/accounts"
            className="text-sm text-slate-300 hover:text-white transition-colors relative group"
          >
            Accounts
            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-violet-400 to-violet-300 group-hover:w-full transition-all duration-300"></span>
          </a>
          <a
            href="/transactions"
            className="text-sm text-slate-300 hover:text-white transition-colors relative group"
          >
            Transactions
            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-violet-400 to-violet-300 group-hover:w-full transition-all duration-300"></span>
          </a>
          <a
            href="/goals"
            className="text-sm text-slate-300 hover:text-white transition-colors relative group"
          >
            Goals
            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-violet-400 to-violet-300 group-hover:w-full transition-all duration-300"></span>
          </a>
        </nav>

        {/* Right Side: User Menu */}
        <div className="flex items-center gap-4">
          {user && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all"
                title={getUserDisplay()}
              >
                {getUserInitial()}
              </button>

              {showUserMenu && (
                <div
                  className="glass-card absolute right-0 mt-2 w-48 py-2 z-50"
                  style={{ top: '100%' }}
                >
                  <div className="px-4 py-2 border-b border-slate-700/30 text-sm text-slate-300">
                    {getUserDisplay()}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700/30 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Gradient bottom border */}
      <div
        className="h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent)',
        }}
      ></div>
    </header>
  )
}
