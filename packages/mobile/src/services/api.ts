import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApiClient } from '@zen-capsule/shared';

const DEV_URL = 'http://10.0.2.2:3000';
const PROD_URL = 'https://your-app.railway.app';
const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

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

export const api = createApiClient({ baseUrl: BASE_URL, getToken });

export type {
  AuthResponse,
  FocusSession,
  FocusHistoryResponse,
  UrgencyResult,
  EmailSummaryResult,
  TaskBreakdownResult,
  WhitelistEntry,
  SyncState,
} from '@zen-capsule/shared';
