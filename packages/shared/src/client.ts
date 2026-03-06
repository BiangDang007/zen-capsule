import { API_PREFIX, ENDPOINTS } from './endpoints.js'
import type {
  RegisterRequest, LoginRequest, AuthResponse,
  StartFocusRequest, EndFocusRequest, FocusSession, FocusHistoryResponse,
  Thought,
  AnalyseRequest, AnalyseResponse, FeedbackRequest,
  EmailSummaryRequest, EmailSummaryResult,
  TaskBreakdownRequest, TaskBreakdownResult,
  WhitelistEntry, AddWhitelistRequest,
  RegisterDeviceRequest, Device, SyncState,
} from './api.js'

export interface ApiClientConfig {
  baseUrl: string
  getToken: () => Promise<string | null> | string | null
}

export interface ApiClient {
  auth: {
    login(data: LoginRequest): Promise<AuthResponse>
    register(data: RegisterRequest): Promise<AuthResponse>
    refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>
    logout(refreshToken?: string): Promise<{ ok: true }>
  }
  focus: {
    start(data: StartFocusRequest): Promise<{ session: FocusSession }>
    end(data: EndFocusRequest): Promise<{ session: FocusSession }>
    history(limit?: number, offset?: number): Promise<FocusHistoryResponse>
    addThought(content: string, sessionId?: string): Promise<{ thought: Thought }>
    thoughts(): Promise<{ thoughts: Thought[] }>
  }
  ai: {
    analyse(data: AnalyseRequest): Promise<AnalyseResponse>
    feedback(data: FeedbackRequest): Promise<{ ok: true }>
    summariseEmails(data: EmailSummaryRequest): Promise<{ summary: EmailSummaryResult }>
    breakdownTask(data: TaskBreakdownRequest): Promise<{ breakdown: TaskBreakdownResult }>
    getWhitelist(): Promise<{ whitelist: WhitelistEntry[] }>
    addWhitelist(data: AddWhitelistRequest): Promise<{ entry: WhitelistEntry }>
    removeWhitelist(id: string): Promise<{ ok: true }>
  }
  sync: {
    state(): Promise<SyncState>
    registerDevice(data: RegisterDeviceRequest): Promise<{ device: Device }>
    devices(): Promise<{ devices: Device[] }>
    removeDevice(id: string): Promise<{ ok: true }>
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const { baseUrl, getToken } = config

  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    },
    focus: {
      start: (data) => post(ENDPOINTS.FOCUS_START, data),
      end: (data) => post(ENDPOINTS.FOCUS_END, data),
      history: (limit = 10, offset = 0) =>
        request(`${ENDPOINTS.FOCUS_HISTORY}?limit=${limit}&offset=${offset}`),
      addThought: (content, sessionId) =>
        post(ENDPOINTS.FOCUS_THOUGHT, { content, sessionId }),
      thoughts: () => request(ENDPOINTS.FOCUS_THOUGHTS),
    },
    ai: {
      analyse: (data) => post(ENDPOINTS.AI_ANALYSE, data),
      feedback: (data) => post(ENDPOINTS.AI_FEEDBACK, data),
      summariseEmails: (data) => post(ENDPOINTS.AI_SUMMARISE_EMAILS, data),
      breakdownTask: (data) => post(ENDPOINTS.AI_BREAKDOWN_TASK, data),
      getWhitelist: () => request(ENDPOINTS.AI_WHITELIST),
      addWhitelist: (data) => post(ENDPOINTS.AI_WHITELIST, data),
      removeWhitelist: (id) => del(`${ENDPOINTS.AI_WHITELIST}/${id}`),
    },
    sync: {
      state: () => request(ENDPOINTS.SYNC_STATE),
      registerDevice: (data) => post(ENDPOINTS.SYNC_DEVICE, data),
      devices: () => request(ENDPOINTS.SYNC_DEVICES),
      removeDevice: (id) => del(`${ENDPOINTS.SYNC_DEVICE}/${id}`),
    },
  }
}
