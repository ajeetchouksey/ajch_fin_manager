export interface User {
  id: string
  email: string
  name: string
  picture?: string
  accessToken: string
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  error: string | null
  login: (code: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface FinanceAccount {
  id: string
  name: string
  type: string
  balance: number
  currency: string
}

export interface Transaction {
  id: string
  accountId: string
  date: string
  description: string
  amount: number
  category: string
}

export interface FinancialGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  category: string
}

// Onboarding Types
export interface UserSchemaDefinition {
  residenceCountries: string[]
  accountTypes: string[]
  expenseCategories: string[]
  declaredGoals?: string[]
  householdMembers?: Array<{ name: string; relationship: string }>
  investmentPreferences?: {
    hasInvestments: boolean
    types?: string[]
  }
  taxSettings?: {
    country: string
    fillingStatus?: string
  }
}

export interface OnboardingMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface OnboardingStatusResponse {
  hasSchema: boolean
  stage?: string
  completedSections?: string[]
  redirectTo?: 'first-login-onboarding' | null
}

export interface OnboardingChatResponse {
  message: string
  schemaUpdate?: Partial<UserSchemaDefinition>
  fallbackToForm?: boolean
}

export interface OnboardingSubmitRequest {
  schema: Partial<UserSchemaDefinition>
  merge?: boolean
}

export interface OnboardingCurrentSchemaResponse {
  schema?: UserSchemaDefinition
  completedSections: string[]
  canAdd: string[]
}

export interface OnboardingSession {
  type: 'initial' | 'progressive'
  focus?: string
  messages: OnboardingMessage[]
  currentSchema?: UserSchemaDefinition
}
