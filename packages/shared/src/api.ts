import type { Phase, Platform, AiCategory, UserAction } from './enums.js'

// ── Auth ──────────────────────────────────────────────

export interface RegisterRequest {
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
  deviceId?: string
}

export interface AuthResponse {
  user: { id: string; email: string }
  accessToken: string
  refreshToken: string
}

// ── Focus ─────────────────────────────────────────────

export interface StartFocusRequest {
  goal: string
}

export interface EndFocusRequest {
  sessionId: string
}

export interface FocusSession {
  id: string
  goal: string
  startedAt: string
  endedAt?: string | null
  durationSeconds?: number | null
  interceptCount: number
  phase: Phase
}

export interface Thought {
  id: string
  content: string
  sessionId?: string | null
  createdAt: string
}

export interface FocusHistoryResponse {
  sessions: FocusSession[]
  total: number
  totalMinutes: number
}

// ── AI ────────────────────────────────────────────────

export interface UrgencyResult {
  score: number
  isUrgent: boolean
  shouldBreakthrough: boolean
  reason: string
  category: AiCategory
}

export interface MessageContext {
  content: string
  senderName?: string
  senderContact?: string
  isWhitelisted: boolean
  repeatCount?: number
  senderRelationship?: SenderRelationship
  hourOfDay?: number
  appName?: string
  recentSenderCategory?: string // what AI scored this sender last time
}

export type SenderRelationship = 'boss' | 'client' | 'family' | 'friend' | 'coworker' | 'other'

export interface AnalyseRequest {
  content: string
  senderName?: string
  senderContact?: string
  subject?: string
  preview?: string
  repeatCount?: number
  appName?: string      // e.g. "Shopee"
  packageName?: string  // e.g. "com.shopee.tw"
}

export interface AnalyseResponse {
  result: UrgencyResult
  logId: string
}

export interface FeedbackRequest {
  logId: string
  userAction: UserAction
}

export interface EmailSummaryRequest {
  emails: Array<{ from: string; subject: string; preview?: string }>
}

export interface EmailSummaryItem {
  from: string
  subject: string
  summary: string
}

export interface EmailSummaryResult {
  urgent: EmailSummaryItem[]
  todo: EmailSummaryItem[]
  personal: EmailSummaryItem[]
  adsCount: number
}

export interface WhitelistEntry {
  id: string
  name: string
  contact: string
  relationship: SenderRelationship
  priority: number
}

export interface AddWhitelistRequest {
  name: string
  contact: string
  relationship?: SenderRelationship
  priority?: number
}

// ── App Rules ────────────────────────────────────────

export type AppRuleAction = 'always_block' | 'always_allow' | 'ask_ai'

export interface AppRule {
  id: string
  appName: string
  packageName?: string | null
  action: AppRuleAction
}

export interface AddAppRuleRequest {
  appName: string
  packageName?: string
  action: AppRuleAction
}

// ── Billing ─────────────────────────────────────────
export type Plan = 'FREE' | 'PRO'

export interface BillingStatus {
  plan: Plan
  planExpiresAt: string | null
  today: {
    analyses: { used: number; limit: number }
    summaries: { used: number; limit: number }
  }
  pricing: {
    monthly: number
    currency: string
  }
}

// ── Session Report with logId for feedback ───────────

export interface SessionReportEntryWithFeedback extends SessionReportEntry {
  logId: string
  aiReason: string | null
  userAction: UserAction | null
}

// ── Sync ──────────────────────────────────────────────

export interface RegisterDeviceRequest {
  name: string
  platform: Platform
  pushToken?: string
}

export interface Device {
  id: string
  name: string
  platform: Platform
  pushToken?: string | null
  lastSeen: string
}

// ── Session Report (break-time notification summary) ──

export interface SessionReportEntry {
  id: string
  appName: string | null
  packageName: string | null
  senderName: string | null
  subject: string
  preview: string
  aiCategory: AiCategory
  aiScore: number
  aiShouldBreak: boolean
  createdAt: string
}

export interface SessionReport {
  sessionId: string
  sessionGoal: string
  startedAt: string
  durationMinutes: number
  totalIntercepted: number
  critical: SessionReportEntry[]
  important: SessionReportEntry[]
  normal: SessionReportEntry[]
  social: SessionReportEntry[]
  ads: {
    count: number
    topApps: string[]  // ["Shopee x8", "momo x4"]
  }
}

export interface SyncState {
  phase: Phase
  focusState: {
    isFocusing: boolean
    currentGoal: string | null
    startedAt: string | null
    durationMinutes: number | null
    todayStats: {
      totalMinutes: number
      totalInterceptions: number
    }
  }
  activeSession: {
    id: string
    goal: string
    startedAt: string
    durationSeconds: number
    interceptCount: number
  } | null
  todayStats: {
    totalMinutes: number
    sessionsCount: number
    totalInterceptions: number
  }
  recentThoughts: Thought[]
}
