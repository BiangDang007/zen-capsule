import { API_PREFIX, ENDPOINTS } from './endpoints.js'
import type {
  RegisterRequest, LoginRequest, AuthResponse,
  ChangePasswordRequest, DeleteAccountRequest,
  StartFocusRequest, EndFocusRequest, FocusSession, FocusHistoryResponse,
  AnalyseRequest, AnalyseResponse, FeedbackRequest,
  EmailSummaryRequest, EmailSummaryResult,
  WhitelistEntry, AddWhitelistRequest,
  AppRule, AddAppRuleRequest,
  SyncState,
  SessionReport,
  BillingStatus,
} from './api.js'

export interface ApiClientConfig {
  baseUrl: string
  getToken: () => Promise<string | null> | string | null
  /** Called on a 401. Return true if a token refresh succeeded (request is retried once). */
  onUnauthorized?: () => Promise<boolean>
}

export interface ApiClient {
  auth: {
    login(data: LoginRequest): Promise<AuthResponse>
    register(data: RegisterRequest): Promise<AuthResponse>
    refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>
    logout(refreshToken?: string): Promise<{ ok: true }>
    changePassword(data: ChangePasswordRequest): Promise<{ ok: true }>
    deleteAccount(data: DeleteAccountRequest): Promise<{ ok: true; message: string }>
  }
  focus: {
    start(data: StartFocusRequest): Promise<{ session: FocusSession }>
    end(data: EndFocusRequest): Promise<{ session: FocusSession }>
    history(limit?: number, offset?: number): Promise<FocusHistoryResponse>
    sessionReport(sessionId?: string): Promise<SessionReport>
  }
  ai: {
    analyse(data: AnalyseRequest): Promise<AnalyseResponse>
    feedback(data: FeedbackRequest): Promise<{ ok: true }>
    summariseEmails(data: EmailSummaryRequest): Promise<{ summary: EmailSummaryResult }>
    getWhitelist(): Promise<{ whitelist: WhitelistEntry[] }>
    addWhitelist(data: AddWhitelistRequest): Promise<{ entry: WhitelistEntry }>
    removeWhitelist(id: string): Promise<{ ok: true }>
    getAppRules(): Promise<{ rules: AppRule[] }>
    addAppRule(data: AddAppRuleRequest): Promise<{ rule: AppRule }>
    removeAppRule(id: string): Promise<{ ok: true }>
  }
  sync: {
    state(): Promise<SyncState>
  }
  billing: {
    status(): Promise<BillingStatus>
    devUpgrade(): Promise<{ ok: true; plan: 'PRO'; planExpiresAt: string }>
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, getToken, onUnauthorized } = config

  async function request<T>(endpoint: string, options: RequestInit = {}, _retried = false): Promise<T> {
    const token = await getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const url = `${baseUrl}${API_PREFIX}${endpoint}`
    const res = await fetch(url, { ...options, headers })

    // Auto-refresh once on 401, then retry with the new token
    if (res.status === 401 && onUnauthorized && !_retried) {
      const refreshed = await onUnauthorized()
      if (refreshed) return request<T>(endpoint, options, true)
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || body.message || `HTTP ${res.status}`)
    }
    return res.json()
  }

  function post<T>(endpoint: string, body: unknown): Promise<T> {
    return request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) })
  }

  function del<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: 'DELETE' })
  }

  return {
    auth: {
      login: (data) => post(ENDPOINTS.AUTH_LOGIN, data),
      register: (data) => post(ENDPOINTS.AUTH_REGISTER, data),
      refresh: (refreshToken) => post(ENDPOINTS.AUTH_REFRESH, { refreshToken }),
      logout: (refreshToken) => post(ENDPOINTS.AUTH_LOGOUT, { refreshToken }),
      changePassword: (data) => post(ENDPOINTS.AUTH_CHANGE_PASSWORD, data),
      deleteAccount: (data) => request(ENDPOINTS.AUTH_DELETE_ACCOUNT, { method: 'DELETE', body: JSON.stringify(data) }),
    },
    focus: {
      start: (data) => post(ENDPOINTS.FOCUS_START, data),
      end: (data) => post(ENDPOINTS.FOCUS_END, data),
      history: (limit = 10, offset = 0) =>
        request(`${ENDPOINTS.FOCUS_HISTORY}?limit=${limit}&offset=${offset}`),
      sessionReport: (sessionId?) =>
        request(`${ENDPOINTS.FOCUS_SESSION_REPORT}${sessionId ? `?sessionId=${sessionId}` : ''}`),
    },
    ai: {
      analyse: (data) => post(ENDPOINTS.AI_ANALYSE, data),
      feedback: (data) => post(ENDPOINTS.AI_FEEDBACK, data),
      summariseEmails: (data) => post(ENDPOINTS.AI_SUMMARISE_EMAILS, data),
      getWhitelist: () => request(ENDPOINTS.AI_WHITELIST),
      addWhitelist: (data) => post(ENDPOINTS.AI_WHITELIST, data),
      removeWhitelist: (id) => del(`${ENDPOINTS.AI_WHITELIST}/${id}`),
      getAppRules: () => request(ENDPOINTS.AI_APP_RULES),
      addAppRule: (data) => post(ENDPOINTS.AI_APP_RULES, data),
      removeAppRule: (id) => del(`${ENDPOINTS.AI_APP_RULES}/${id}`),
    },
    sync: {
      state: () => request(ENDPOINTS.SYNC_STATE),
    },
    billing: {
      status: () => request(ENDPOINTS.BILLING_STATUS),
      devUpgrade: () => post(ENDPOINTS.BILLING_DEV_UPGRADE, {}),
    },
  }
}
