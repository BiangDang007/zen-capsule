import { createApiClient } from '@zen-capsule/shared'

const BASE_URL = 'http://localhost:3000'

async function getToken(): Promise<string | null> {
  const { token } = await chrome.storage.local.get('token')
  return token ?? null
}

export const api = createApiClient({ baseUrl: BASE_URL, getToken })
