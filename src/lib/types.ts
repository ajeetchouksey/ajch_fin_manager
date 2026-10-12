/**
 * Core types for Finance Manager Cloudflare Workers deployment
 * Multi-provider AI support with Claude, Gemini, and OpenAI
 */

// AI Provider types
export type AIProvider = "claude" | "gemini" | "openai" | "none";
export type AIModel = "cheap" | "standard" | "powerful";

export interface AIProviderConfig {
  name: AIProvider;
  models: {
    cheap: string;      // Haiku, 2.0 Flash, 4o Mini
    standard: string;   // Sonnet, 1.5 Pro, GPT-4 Turbo
    powerful: string;   // Opus, Gemini 2.0 Advanced, GPT-4o
  };
  apiKeyEnv: string;
  baseUrl?: string;
}

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  provider: AIProvider;
  model: string;
  content: string;
  tokens?: {
    input: number;
    output: number;
  };
  cost?: number;
}

// User and Profile types
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  countries: string[];
  currencies: string[];
  homeCurrency: string;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
  preferences: {
    aiProvider: AIProvider;
    aiModel: AIModel;
    theme: "light" | "dark";
    timezone: string;
  };
}

export interface UserSession {
  sessionId: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

// Google Drive types
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

export interface GoogleOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope: string;
}

// Finance data types
export interface Account {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type: "bank" | "card" | "investment" | "savings" | "crypto";
  provider?: string;
  lastSyncedAt?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  fromAccount?: string;
  toAccount?: string;
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline: string;
  category: string;
  priority: "low" | "medium" | "high";
  createdAt: string;
}

export interface FinancialSnapshot {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  currency: string;
  lastUpdated: string;
  accounts: Account[];
  recentTransactions: Transaction[];
  goals: Goal[];
}

// Chat and Analysis types
export interface ChatMessage {
  id: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  provider?: AIProvider;
  model?: string;
  timestamp: string;
  suggestions?: string[];
}

export interface AnalysisRequest {
  id: string;
  userId: string;
  type: "spending" | "savings" | "goals" | "health" | "forecast";
  status: "pending" | "running" | "completed" | "failed";
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

export interface Proposal {
  id: string;
  userId: string;
  type: "transaction" | "account" | "goal" | "setting";
  action: string;
  data: Record<string, unknown>;
  reasoning: string;
  confidence: number;
  status: "pending" | "applied" | "dismissed";
  createdAt: string;
  appliedAt?: string;
}

// Request/Response types
export interface ChatRequest {
  userId: string;
  message: string;
  provider?: AIProvider;
  model?: AIModel;
  includeAnalysis?: boolean;
}

export interface ChatResponse {
  messageId: string;
  content: string;
  provider: AIProvider;
  model: string;
  suggestions?: Proposal[];
  analysisId?: string;
}

export interface SyncRequest {
  userId: string;
  scope: "all" | "accounts" | "transactions" | "goals";
  fromTimestamp?: string;
}

export interface SyncResponse {
  success: boolean;
  syncedAt: string;
  changes?: {
    accounts: number;
    transactions: number;
    goals: number;
  };
  nextSyncAt: string;
}

// Error types
export interface AppError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

// Cloudflare Worker environment bindings
export interface CloudflareEnv {
  CACHE: any; // R2Bucket
  SESSIONS: any; // KVNamespace
  ENVIRONMENT: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CLAUDE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEFAULT_AI_PROVIDER: AIProvider;
}

// Rate limiting and cost tracking
export interface RateLimitBucket {
  userId: string;
  provider: AIProvider;
  requestCount: number;
  costUSD: number;
  resetAt: string;
  dailyLimit: number;
  costLimit: number;
}

export interface ProviderCost {
  provider: AIProvider;
  model: string;
  inputTokenCost: number;
  outputTokenCost: number;
}
