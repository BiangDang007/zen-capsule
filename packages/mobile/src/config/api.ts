// Zen Capsule API Configuration
// TODO: Replace with your Railway production URL once obtained
const DEV_URL = 'http://10.0.2.2:3000'; // Android emulator -> host localhost
const PROD_URL = 'https://your-app.railway.app'; // <- Railway URL here

export const API_BASE = __DEV__ ? DEV_URL : PROD_URL;
export const API_PREFIX = '/api/v1';
export const API_URL = `${API_BASE}${API_PREFIX}`;
