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
