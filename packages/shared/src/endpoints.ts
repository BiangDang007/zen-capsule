export const API_PREFIX = '/api/v1' as const

export const ENDPOINTS = {
  // Auth
  AUTH_REGISTER: '/auth/register',
  AUTH_LOGIN: '/auth/login',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',

  // Focus
  FOCUS_START: '/focus/start',
  FOCUS_END: '/focus/end',
  FOCUS_HISTORY: '/focus/history',
  FOCUS_THOUGHT: '/focus/thought',
  FOCUS_THOUGHTS: '/focus/thoughts',
  FOCUS_SESSION_REPORT: '/focus/session-report',

  // AI
  AI_ANALYSE: '/ai/analyse',
  AI_FEEDBACK: '/ai/feedback',
  AI_EXPORT: '/ai/export',
  AI_EXPORT_CSV: '/ai/export/csv',
  AI_SUMMARISE_EMAILS: '/ai/summarise-emails',
  AI_BREAKDOWN_TASK: '/ai/breakdown-task',
  AI_WHITELIST: '/ai/whitelist',
  AI_APP_RULES: '/ai/app-rules',

  // Sync
  SYNC_DEVICE: '/sync/device',
  SYNC_STATE: '/sync/state',
  SYNC_DEVICES: '/sync/devices',

  // Health
  HEALTH: '/health',
} as const
