import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApiClient } from '@zen-capsule/shared';

const DEV_URL = 'http://10.0.2.2:3001';
const PROD_URL = 'https://your-app.railway.app';
const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

const TOKEN_KEY = 'zen_capsule_token';
const REFRESH_KEY = 'zen_capsule_refresh';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if successful, false if the user needs to re-login.
 */
export async function tryRefreshToken(): Promise<boolean> {
  try {
    const refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    await saveToken(data.accessToken);
    await AsyncStorage.setItem(REFRESH_KEY, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export const api = createApiClient({ baseUrl: BASE_URL, getToken });

export type {
  AuthResponse,
  FocusSession,
  FocusHistoryResponse,
  UrgencyResult,
  EmailSummaryResult,
  WhitelistEntry,
  SyncState,
} from '@zen-capsule/shared';
