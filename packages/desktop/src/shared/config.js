// Zen Capsule Desktop — Configuration
const config = {
  // API
  API_BASE: 'http://localhost:3000',
  API_PREFIX: '/api/v1',
  get API_URL() { return this.API_BASE + this.API_PREFIX; },

  // TODO: Replace with your Railway URL
  PROD_API_BASE: 'https://your-app.railway.app',

  // Blocked domains — these get written to /etc/hosts during focus
  BLOCKED_DOMAINS: [
    // Facebook ecosystem
    'www.facebook.com',
    'facebook.com',
    'm.facebook.com',
    'web.facebook.com',
    'www.messenger.com',
    'messenger.com',
    'www.instagram.com',
    'instagram.com',

    // Google email
    'mail.google.com',

    // Twitter / X
    'twitter.com',
    'www.twitter.com',
    'x.com',
    'www.x.com',

    // TikTok
    'www.tiktok.com',
    'tiktok.com',
    'm.tiktok.com',

    // Threads
    'www.threads.net',
    'threads.net',

    // WhatsApp Web
    'web.whatsapp.com',

    // YouTube (optional — uncomment if desired)
    // 'www.youtube.com',
    // 'youtube.com',
    // 'm.youtube.com',

    // Reddit (optional)
    // 'www.reddit.com',
    // 'reddit.com',
  ],

  // Hosts file marker (to identify our entries)
  HOSTS_MARKER_START: '# === ZEN CAPSULE FOCUS BLOCK START ===',
  HOSTS_MARKER_END:   '# === ZEN CAPSULE FOCUS BLOCK END ===',

  // AI urgency keywords (same as Chrome extension)
  URGENT_KEYWORDS: [
    '急', '緊急', '掛掉', '壞掉', '立刻', '馬上',
    '火', '修', '趕快', '出問題', '異常',
    'crash', 'down', 'urgent', 'ASAP', 'emergency',
    'critical', 'outage', 'incident',
  ],

  // Focus presets (minutes)
  FOCUS_PRESETS: [25, 45, 60, 90],
};

module.exports = config;
