import { API_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

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
export interface FocusSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
}

export function startSession(durationMinutes: number) {
  return request<FocusSession>('/sessions/start', {
    method: 'POST',
    body: JSON.stringify({ durationMinutes }),
  });
}

export function endSession(sessionId: string) {
  return request<FocusSession>(`/sessions/${sessionId}/end`, {
    method: 'POST',
  });
}

export function getSessionHistory() {
  return request<FocusSession[]>('/sessions/history');
}

// ─── AI ──────────────────────────────────────────────
export interface UrgencyResult {
  isUrgent: boolean;
  score: number;
  reason: string;
}

export function analyseMessage(message: string, sender?: string) {
  return request<UrgencyResult>('/ai/analyse', {
    method: 'POST',
    body: JSON.stringify({ message, sender }),
  });
}

export interface EmailSummary {
  summaries: Array<{ subject: string; summary: string; urgent: boolean }>;
}

export function summariseEmails(emails: Array<{ subject: string; body: string }>) {
  return request<EmailSummary>('/ai/summarise-emails', {
    method: 'POST',
    body: JSON.stringify({ emails }),
  });
}

export interface TaskBreakdown {
  subtasks: Array<{ title: string; estimatedMinutes: number }>;
}

export function breakdownTask(task: string) {
  return request<TaskBreakdown>('/ai/breakdown-task', {
    method: 'POST',
    body: JSON.stringify({ task }),
  });
}

// ─── Sync ────────────────────────────────────────────
export function getSyncState() {
  return request<Record<string, unknown>>('/sync/state');
}

// ─── Whitelist ───────────────────────────────────────
export interface WhitelistEntry {
  id: string;
  sender: string;
  reason?: string;
}

export function getWhitelist() {
  return request<WhitelistEntry[]>('/whitelist');
}

export function addWhitelist(sender: string, reason?: string) {
  return request<WhitelistEntry>('/whitelist', {
    method: 'POST',
    body: JSON.stringify({ sender, reason }),
  });
}

export function removeWhitelist(id: string) {
  return request<void>(`/whitelist/${id}`, { method: 'DELETE' });
}
