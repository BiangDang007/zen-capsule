import type { UrgencyResult } from '@zen-capsule/shared'

// ── Chrome Storage State ──────────────────────────────

export interface StoredFocusState {
  isFocusing: boolean
  currentGoal: string
  startedAt: string
  durationMinutes: number
  sessionId: string
  interceptCount: number
}

export interface InterceptedEmail {
  sender?: string
  from?: string
  subject: string
  preview?: string
  time?: string
  source?: 'system_notification' | 'gmail_dom'
  urgency?: UrgencyResult & { breakthrough?: boolean }
}

// ── Chrome Messages ───────────────────────────────────

export type ExtensionMessage =
  | { type: 'SET_TOKEN'; token: string }
  | { type: 'GET_STATE' }
  | { type: 'LOGOUT' }
  | { type: 'FORCE_CHECK' }
  | { type: 'EMAIL_INTERCEPTED'; email: InterceptedEmail }
  | { type: 'CLEAR_EMAILS' }
  | { type: 'GMAIL_OVERRIDE' }
  | { type: 'FOCUS_STATE_CHANGED'; isFocusing: boolean; focusState: unknown }
