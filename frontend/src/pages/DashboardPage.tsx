import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { FirstLoginOnboarding } from '../components/FirstLoginOnboarding'
import { ProgressiveOnboardingModal } from '../components/ProgressiveOnboardingModal'
import { SlashCommandPalette, type SlashCommand } from '../components/SlashCommandPalette'
import { useOnboarding } from '../hooks/useOnboarding'

export function DashboardPage() {
  const [showFirstLogin, setShowFirstLogin] = useState(false)
  const [showProgressiveOnboarding, setShowProgressiveOnboarding] = useState(false)

  const { checkStatus } = useOnboarding()

  // Check onboarding status on mount
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      const status = await checkStatus()
      if (status && !status.hasSchema) {
        setShowFirstLogin(true)
      }
    }

    checkOnboardingStatus()
  }, [checkStatus])

  const handleCommandExecuted = (command: SlashCommand) => {
    switch (command) {
      case 'onboarding-help':
        setShowProgressiveOnboarding(true)
        break
      case 'reset-setup':
        // Would need to implement reset functionality
        console.log('Reset setup')
        break
      case 'settings':
        // Would navigate to settings
        console.log('Open settings')
        break
    }
  }

  return (
    <>
      <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <p className="page-eyebrow">Welcome back</p>
        <h1 className="text-4xl font-bold text-white">
          Your <span className="heading-gradient">Financial</span> Dashboard
        </h1>
        <p className="text-slate-400 mt-2">
          Track your finances and achieve your goals with AaryaAI
        </p>
      </div>


      {/* Accounts Section */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="section-heading">Your Accounts</h2>
          <button className="px-4 py-2 bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all">
            + Add Account
          </button>
        </div>

        <div className="glass-card glass-sheen glass-edge p-6">
          <div className="text-center py-12">
            <div className="text-slate-400 mb-4">
              <svg
                className="w-12 h-12 mx-auto opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6v6m0 0v6m0-6h6m0 0h6m0 0h-6m0-6h-6"
                />
              </svg>
            </div>
            <p className="text-slate-400">
              No accounts yet. Start by adding your first account.
            </p>
          </div>
        </div>
      </section>



    </Layout>

      {/* Modals */}
      {showFirstLogin && (
        <FirstLoginOnboarding
          onComplete={() => setShowFirstLogin(false)}
          onSkip={() => setShowFirstLogin(false)}
        />
      )}

      {showProgressiveOnboarding && (
        <ProgressiveOnboardingModal
          onClose={() => setShowProgressiveOnboarding(false)}
        />
      )}

      {/* Slash Command Palette */}
      <SlashCommandPalette
        onCommandExecuted={handleCommandExecuted}
        handlers={{
          'onboarding-help': () => setShowProgressiveOnboarding(true),
          'reset-setup': () => console.log('Reset setup'),
          'settings': () => console.log('Open settings'),
        }}
      />
    </>
  )
}
