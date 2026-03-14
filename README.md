# Zen Capsule - Digital Sanctuary

> All environment settings and versions for this project are documented in this file.
> Any agent (including Claude Code) modifying or setting up this project should read this file first.
> See also: `CLAUDE.md` for agent-specific instructions.

## Project Overview

Zen Capsule is a focus-protection system that intercepts notifications during focus sessions, classifies their urgency with AI, and only lets truly urgent messages break through. Everything else is batched and presented in a summary during break time.

---

## Features

### 🎯 Focus Session Management

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Start/End Focus** | Set a goal and start a timed focus session. Timer runs locally with visual countdown. | Mobile, Extension, Desktop |
| **Duration Presets** | Quick-select buttons: 25 / 45 / 60 / 90 minutes, or custom duration (1–480 min). | Mobile, Extension |
| **Lockdown Mode** | Desktop only — once focus starts, it **cannot** be manually stopped until the timer expires. | Desktop |
| **Cross-Device Sync** | All devices stay in sync on focus state. Devices poll `/sync/state` every 10 seconds. | All |
| **Session History** | Browse all past sessions with duration, goal, completion status, and total focus minutes. | Mobile |
| **Thought Capture** | Quick-capture fleeting thoughts during breaks (Alt+S shortcut). Stored for later review. | Mobile, Backend |
| **Session Statistics** | Today's focus count, total minutes, and interception stats displayed across platforms. | All |

### 🛡️ Notification Interception

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Android Notification Listener** | System-level `NotificationListenerService` intercepts ALL incoming notifications during focus. Blocks immediately, then sends to AI for classification. | Mobile (Android) |
| **Gmail Content Script** | `MutationObserver` watches Gmail inbox rows in real-time. Intercepted emails are dimmed (opacity 0.35, grayscale filter). | Extension |
| **Gmail Domain Blocking** | Manifest V3 `declarativeNetRequest` redirects `mail.google.com` to a block page during focus. | Extension |
| **Gmail UI Suppression** | Hides unread badge counts and injects a persistent shield banner: "🛡 ZEN CAPSULE · 專注中 · Gmail 通知已封鎖". | Extension |
| **System Hosts File Blocking** | Modifies `/etc/hosts` to block distracting domains OS-wide (Facebook, Instagram, Twitter, TikTok, etc.). Requires admin privileges. | Desktop |
| **macOS Do Not Disturb** | Activates system-level Focus mode to silence all notifications except phone calls. | Desktop |

### 🤖 AI Urgency Analysis

| Feature | Description | Details |
|---------|-------------|---------|
| **5-Category Classification** | Every notification is scored 0–100 and classified into one of 5 categories. | **CRITICAL** (80–100): Cannot wait 25 min. **IMPORTANT** (50–79): Needs response today. **NORMAL** (20–49): Can wait. **SOCIAL** (0–19): Casual chat. **ADS** (0): Promotions, always blocked. |
| **Claude Haiku Analysis** | Fast, low-cost urgency scoring for every incoming notification. | Model: `claude-haiku-4-5-20251001`, max 256 tokens |
| **Claude Sonnet Summaries** | Post-focus batch summarization of all intercepted emails with semantic classification. | Model: `claude-sonnet-4-6`, max 1200 tokens |
| **Score Boosting** | Automatically boost urgency if message contains keywords (急/crash/down/ASAP), sender is boss/family, or same sender messages 3+ times. | Backend AI prompt |
| **Repeat Message Detection** | If the same sender sends 5+ messages within a focus session, force breakthrough regardless of score. | Backend logic |
| **Ads Silent Blocking** | AI-detected promotions (score 0) are silently suppressed — never shown in break summary. | Backend + Mobile |
| **Prompt Injection Protection** | All user input sanitised (`< >` → fullwidth chars) and wrapped in XML tags. System prompt instructs AI to treat tags as DATA only. | Backend |

### 🔔 Breakthrough Notifications

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Smart Breakthrough** | Only truly urgent notifications (score ≥ 80 + `shouldBreakthrough=true`) break through the barrier. | All |
| **Whitelist Override** | Whitelisted senders with score ≥ 80 automatically break through. | Backend |
| **Android Native Alert** | Breakthrough notifications appear in the Android notification bar with ⚡ badge. | Mobile |
| **Browser Notification** | Chrome `notifications.create()` with high priority and `requireInteraction: true`. | Extension |
| **Gmail 5-Min Unlock** | On urgent email, Gmail blocking is temporarily disabled for 5 minutes, then auto-relocks. | Extension |

### 📬 Break-Time Reports

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Session Report** | Post-focus summary of all intercepted notifications grouped by category (🔴 Critical, 🟡 Important, 🔵 Normal, 💬 Social). | Mobile |
| **Expandable Sections** | Tap category headers to expand/collapse notification lists. Critical and Important are open by default. | Mobile |
| **Notification Details** | Each entry shows app name, sender, subject, preview text, relative timestamp, and breakthrough badge. | Mobile |
| **Ads Strip** | "🛒 已靜默擋下 N 則廣告（App1、App2、App3）" — counts ads and shows top offending apps. | Mobile |
| **Session Navigation** | Browse between completed sessions with ◀ / ▶ buttons (not just the latest one). | Mobile |
| **Email Summary** | AI-generated summary of intercepted emails categorized as urgent / todo / personal / ads. | Extension |
| **Pull-to-Refresh** | Swipe down to reload the latest report data. | Mobile |

### 👤 Account & Settings

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Registration & Login** | Email/password auth with bcrypt hashing (12 rounds). | All |
| **JWT Token Management** | 15-minute access tokens + 30-day refresh tokens with auto-rotation. | Backend + Mobile |
| **Auto Token Refresh** | On 401 error, automatically attempt token refresh before forcing re-login. | Mobile |
| **Whitelist Management** | Add/remove trusted senders. Whitelisted contacts get priority treatment in AI analysis. | Mobile, Backend |
| **Notification Preferences** | Toggle urgent notification breakthrough on/off. | Mobile |
| **Device Management** | Register/remove devices for cross-device sync. | Backend |
| **Sign Out** | Logout with confirmation dialog, token revocation, and local storage cleanup. | Mobile |

### 📊 Data & Export

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Behavior Logging** | Every AI decision auto-logged with full context (sender, content, score, category, timestamp, focus minute, hour/day of week). | Backend |
| **User Feedback** | Users can confirm/override AI decisions (ALLOWED_THROUGH, DISMISSED, OVERRODE_AI, etc.) — creates ground truth labels. | Backend |
| **Training Data Export (JSON)** | Export labelled logs with input features, AI predictions, and ground truth labels for ML training. | Backend |
| **Training Data Export (CSV)** | CSV format for Excel/pandas with CSV injection protection. | Backend |
| **Accuracy Metrics** | Export includes AI accuracy stats (% correct, urgent vs not-urgent counts). | Backend |

### 🔒 Security

| Feature | Description |
|---------|-------------|
| **Prompt Injection Defence** | User input sanitised + XML-tagged; system prompts instruct AI to ignore embedded instructions. |
| **Global Error Handler** | 500 errors return generic message in production; stack traces never leaked. |
| **Export Auth via Header** | `X-Export-Key` header (not query params) to prevent key leakage in logs/browser history. |
| **Rate Limiting** | Global: 100/min. Per-route: analyse 30/min, summarise 5/min. Daily caps: 300 analyses, 20 summaries. |
| **Race Condition Protection** | Usage limit check uses Prisma `$transaction` with Serializable isolation. |
| **CSV Injection Prevention** | Export cells starting with `= + - @` prefixed with single quote. |
| **Security Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `HSTS` (production). |
| **Password Hashing** | bcrypt with 12 rounds. |
| **Token Rotation** | Old refresh token deleted on refresh; prevents replay attacks. |
| **Secrets Management** | `.env` in `.gitignore`; API key server-side only, never exposed to client. |

### 🎨 UI/UX

| Feature | Description | Platforms |
|---------|-------------|-----------|
| **Dark Theme** | Purple/gold accent palette (#0F0F1A background, #6C63FF accent) across all platforms. | All |
| **Animated Timer** | Pulsing circle animation during focus countdown. | Mobile |
| **Progress Ring** | SVG circular ring showing focus progress percentage. | Extension |
| **Empty States** | Friendly messages with emoji icons when no data is available. | Mobile |
| **Loading Spinners** | Activity indicators during data fetching. | Mobile |
| **Partial Chinese Localization** | UI text in Traditional Chinese (zh-TW) for core features. | Mobile, Extension |

### 🖥️ Platform-Specific

| Feature | Mobile (Android) | Chrome Extension | Desktop (Electron) |
|---------|:---:|:---:|:---:|
| Focus Timer | ✅ | ✅ | ✅ |
| Notification Interception | ✅ (system-level) | ✅ (Gmail only) | — |
| Domain Blocking | — | ✅ (declarativeNetRequest) | ✅ (/etc/hosts) |
| Break Report | ✅ | ✅ | — |
| Session History | ✅ | — | — |
| Lockdown Mode | — | — | ✅ |
| DND Integration | — | — | ✅ (macOS) |
| Tray/Menu Bar | — | ✅ (badge) | ✅ (tray icon) |
| Cross-Device Sync | ✅ | ✅ | ✅ |

---

## Architecture

```
zen-capsule/                          # npm workspaces monorepo
├── packages/backend/                 # API server (Fastify + Prisma + PostgreSQL)
├── packages/mobile/                  # Android app (React Native 0.84)
├── packages/shared/                  # Shared types, API client, constants
├── packages/extension/               # Chrome Extension (Manifest V3)
└── packages/desktop/                 # Mac menu-bar app (Electron)
```

---

## Environment Requirements

### System-Level Dependencies

| Software          | Required Version        | Current (dev machine)        | Install Command                              |
|-------------------|------------------------|------------------------------|----------------------------------------------|
| **Node.js**       | >= 22.11.0             | v25.4.0                      | `brew install node`                          |
| **npm**           | >= 9.0 (workspaces)    | (bundled with Node)          | (comes with Node)                            |
| **PostgreSQL**    | >= 14                  | 16.13                        | `brew install postgresql@16`                 |
| **Java (JDK)**    | 17                     | OpenJDK 17.0.18 (Homebrew)   | `brew install openjdk@17`                    |
| **Android Studio**| 2024.x+                | 2025.3.2.6 (Panda 2)        | https://developer.android.com/studio         |
| **Android SDK**   | API 36                 | 36.1                         | Via Android Studio SDK Manager               |
| **Android NDK**   | 27.x                   | 27.1.12297006                | Via Android Studio SDK Manager               |

### Key Environment Variables

```bash
# JAVA_HOME (macOS Apple Silicon)
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home

# Android SDK
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

---

## Package Versions (Dependencies)

### Backend (`packages/backend`)

| Dependency          | Version    | Purpose                          |
|---------------------|------------|----------------------------------|
| fastify             | ^4.28.1    | Web framework                    |
| @prisma/client      | ^5.22.0    | Database ORM                     |
| prisma              | ^5.22.0    | Migration & code generation      |
| @anthropic-ai/sdk   | ^0.39.0    | Claude AI API client             |
| @fastify/jwt        | ^8.0.1     | JWT authentication               |
| @fastify/rate-limit  | ^9.1.0    | Rate limiting                    |
| @fastify/cors       | ^9.0.1     | CORS handling                    |
| @fastify/static     | ^7.0.4     | Static file serving              |
| bcryptjs            | ^2.4.3     | Password hashing                 |
| zod                 | ^3.23.8    | Input validation                 |
| tsx                 | ^4.19.0    | TypeScript execution (dev)       |
| typescript          | ^5.6.0     | TypeScript compiler              |

### Mobile (`packages/mobile`)

| Dependency                           | Version    | Purpose                |
|--------------------------------------|------------|------------------------|
| react-native                         | 0.84.1     | Mobile framework       |
| react                                | 19.2.3     | UI library             |
| @react-navigation/native            | ^7.1.33    | Navigation             |
| @react-navigation/bottom-tabs       | ^7.15.5    | Tab navigation         |
| @react-navigation/native-stack      | ^7.14.4    | Stack navigation       |
| @react-native-async-storage/async-storage | ^1.24.0 | Local storage       |
| react-native-screens                 | ^4.24.0    | Native screen support  |
| react-native-safe-area-context       | ^5.5.2     | Safe area handling     |
| typescript                           | ^5.8.3     | TypeScript compiler    |

### Android Build Config

| Setting          | Value              |
|------------------|--------------------|
| compileSdkVersion | 36                |
| targetSdkVersion  | 36                |
| minSdkVersion     | 24 (Android 7.0)  |
| buildToolsVersion | 36.0.0            |
| kotlinVersion     | 2.1.20            |
| applicationId     | com.zencapsuleapp  |

### Shared (`packages/shared`)

| Dependency  | Version | Purpose            |
|-------------|---------|---------------------|
| typescript  | ^5.6.0  | TypeScript compiler |

### Extension (`packages/extension`)

| Dependency    | Version   | Purpose             |
|---------------|-----------|---------------------|
| @types/chrome | ^0.0.300  | Chrome API types    |
| esbuild       | ^0.24.0   | Bundler             |
| typescript    | ^5.7.0    | TypeScript compiler |

### Desktop (`packages/desktop`)

| Dependency        | Version  | Purpose          |
|-------------------|----------|------------------|
| electron          | ^33.0.0  | Desktop framework |
| electron-builder  | ^25.0.0  | Packaging         |
| electron-store    | ^8.1.0   | Local persistence |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/BiangDang007/zen-capsule.git
cd zen-capsule
npm install
```

### 2. Database Setup

```bash
# Start PostgreSQL
brew services start postgresql@16

# Create database
createdb zen_capsule

# Run migrations + generate Prisma client
npm run db:migrate
npm run db:generate
```

### 3. Environment Variables

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env`:

```env
DATABASE_URL=postgresql://<your-username>@localhost:5432/zen_capsule
JWT_SECRET=<run: openssl rand -hex 32>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d
ANTHROPIC_API_KEY=sk-ant-<your-key-from-console.anthropic.com>
PORT=3001
NODE_ENV=development
EXPORT_KEY=<any-random-string>
```

### 4. Build Shared Package (Required First)

```bash
npm -w packages/shared run build
```

> **Important**: Always rebuild shared after modifying it. Mobile and backend depend on it.

### 5. Start Backend

```bash
# Option A: via npm script
npm run dev:backend

# Option B: with env vars inline (if .env loading fails)
export DATABASE_URL=postgresql://... ANTHROPIC_API_KEY=sk-ant-... JWT_SECRET=... PORT=3001 && npx tsx packages/backend/src/index.ts
```

Backend runs at `http://localhost:3001`. Health check: `GET /health`

### 6. Start Android App (Emulator)

```bash
# Start emulator
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 &

# Wait for boot, then build and install
cd packages/mobile
npx react-native run-android
```

This starts Metro bundler (port 8081) and installs the debug APK.

> **Emulator networking**: Inside the emulator, `10.0.2.2` maps to host `localhost`. The app is configured to use `http://10.0.2.2:3001` in dev mode.

### 7. Chrome Extension

```bash
npm run build:extension
```

Load in Chrome: `chrome://extensions` > Developer mode > Load unpacked > select `packages/extension/`

### 8. Mac Desktop App

```bash
npm run dev:desktop
```

---

## Useful Commands

```bash
# Backend (hot reload)
npm run dev:backend

# Shared package rebuild
npm -w packages/shared run build

# Database migration
npm run db:migrate

# Database GUI (Prisma Studio)
npm run db:studio

# Chrome Extension (watch mode)
npm run dev:extension

# Android emulator management
~/Library/Android/sdk/emulator/emulator -list-avds
~/Library/Android/sdk/platform-tools/adb devices

# Android app debug
~/Library/Android/sdk/platform-tools/adb logcat -s ReactNativeJS

# Force restart Android app
~/Library/Android/sdk/platform-tools/adb shell am force-stop com.zencapsuleapp
~/Library/Android/sdk/platform-tools/adb shell am start -n com.zencapsuleapp/.MainActivity

# Clear Android app data (forces re-login)
~/Library/Android/sdk/platform-tools/adb shell pm clear com.zencapsuleapp

# Send test notification to emulator
~/Library/Android/sdk/platform-tools/adb shell cmd notification post -S messaging -t "Test" "tag1" "Hello from test"
```

---

## Android Emulator Details

| Item            | Value                    |
|-----------------|--------------------------|
| AVD Name        | Medium_Phone_API_36.1    |
| Alt AVD         | Pixel8_API35             |
| SDK Location    | ~/Library/Android/sdk    |
| Emulator Binary | ~/Library/Android/sdk/emulator/emulator |
| ADB Binary      | ~/Library/Android/sdk/platform-tools/adb |
| App Package     | com.zencapsuleapp        |
| Metro Port      | 8081                     |
| Backend Port    | 3001                     |
| Emulator -> Host | 10.0.2.2 = localhost    |

---

## API Endpoints Overview

| Method | Endpoint                   | Auth | Purpose                        |
|--------|----------------------------|------|--------------------------------|
| POST   | /api/v1/auth/register      | No   | Create account                 |
| POST   | /api/v1/auth/login         | No   | Login, get tokens              |
| POST   | /api/v1/auth/refresh       | No   | Refresh access token           |
| POST   | /api/v1/focus/start        | JWT  | Start focus session            |
| POST   | /api/v1/focus/end          | JWT  | End focus session              |
| GET    | /api/v1/focus/history      | JWT  | Session history (paginated)    |
| GET    | /api/v1/focus/session-report | JWT | Break-time notification summary |
| POST   | /api/v1/ai/analyse         | JWT  | Classify notification urgency  |
| POST   | /api/v1/ai/feedback        | JWT  | User feedback on AI decision   |
| POST   | /api/v1/ai/summarise-emails | JWT | Batch email summary            |
| GET    | /api/v1/ai/export          | JWT + X-Export-Key header | Export training data |
| GET    | /api/v1/ai/whitelist       | JWT  | List whitelisted contacts      |
| POST   | /api/v1/ai/whitelist       | JWT  | Add whitelisted contact        |
| GET    | /api/v1/sync/state         | JWT  | Cross-device sync state        |

---

## Troubleshooting

**Q: `prisma migrate dev` fails**
Ensure PostgreSQL is running (`pg_isready`) and `DATABASE_URL` is correct in `.env`.

**Q: Backend says "Could not resolve authentication method"**
`ANTHROPIC_API_KEY` is not set. Check `.env` values have no quotes. If `--env-file` doesn't work, export vars directly: `export ANTHROPIC_API_KEY=sk-ant-... && npx tsx packages/backend/src/index.ts`

**Q: Android app shows "Unauthorized" on Messages tab**
JWT token expired (15 min). The app now auto-refreshes tokens, but if it persists, clear app data: `adb shell pm clear com.zencapsuleapp`

**Q: Metro bundler connection issues / white screen**
Force restart: `adb shell am force-stop com.zencapsuleapp` then reopen. This is a dev-mode issue only.

**Q: `npx react-native run-android` fails with JAVA_HOME error**
Set JAVA_HOME: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`

**Q: Shared package changes not reflected in mobile/backend**
Rebuild shared: `npm -w packages/shared run build`

**Q: Chrome Extension can't connect to backend**
Confirm backend is running on the expected port (default 3001). Extension connects to `http://localhost:3001`.

**Q: Node.js `--env-file` doesn't load values correctly**
Known issue: Node's `--env-file` flag doesn't strip quotes from values. Remove all quotes in `.env` file, or export vars directly in shell.
