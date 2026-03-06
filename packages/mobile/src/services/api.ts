import { API_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AuthResponse,
  FocusSession,
  FocusHistoryResponse,
  UrgencyResult,
  AnalyseResponse,
  EmailSummaryResult,
  TaskBreakdownResult,
  WhitelistEntry,
  SyncState,
} from '@zen-capsule/shared';

export type {
  AuthResponse,
  FocusSession,
  UrgencyResult,
  EmailSummaryResult,
  TaskBreakdownResult,
  WhitelistEntry,
  SyncState,
};

const TOKEN_KEY = 'zen_capsule_token';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Auth ────────────────────────────────────────────
export function register(email: string, password: string) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ─── Focus Session ───────────────────────────────────
export function startSession(goal: string) {
  return request<{ session: FocusSession }>('/focus/start', {
    method: 'POST',
    body: JSON.stringify({ goal }),
  });
}

export function endSession(sessionId: string) {
  return request<{ session: FocusSession }>('/focus/end', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function getSessionHistory(limit = 10, offset = 0) {
  return request<FocusHistoryResponse>(`/focus/history?limit=${limit}&offset=${offset}`);
}

// ─── AI ──────────────────────────────────────────────
export function analyseMessage(content: string, senderName?: string, senderContact?: string) {
  return request<AnalyseResponse>('/ai/analyse', {
    method: 'POST',
    body: JSON.stringify({ content, senderName, senderContact }),
  });
}

export function summariseEmails(emails: Array<{ from: string; subject: string; preview?: string }>) {
  return request<{ summary: EmailSummaryResult }>('/ai/summarise-emails', {
    method: 'POST',
    body: JSON.stringify({ emails }),
  });
}

export function breakdownTask(goal: string, durationMinutes = 25) {
  return request<{ breakdown: TaskBreakdownResult }>('/ai/breakdown-task', {
    method: 'POST',
    body: JSON.stringify({ goal, durationMinutes }),
  });
}

// ─── Sync ────────────────────────────────────────────
export function getSyncState() {
  return request<SyncState>('/sync/state');
}

// ─── Whitelist ───────────────────────────────────────
export function getWhitelist() {
  return request<{ whitelist: WhitelistEntry[] }>('/ai/whitelist');
}

export function addWhitelist(name: string, contact: string, priority = 1) {
  return request<{ entry: WhitelistEntry }>('/ai/whitelist', {
    method: 'POST',
    body: JSON.stringify({ name, contact, priority }),
  });
}

export function removeWhitelist(id: string) {
  return request<{ ok: true }>(`/ai/whitelist/${id}`, { method: 'DELETE' });
}
