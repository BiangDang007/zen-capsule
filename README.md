# Zen Capsule - Digital Sanctuary

> All environment settings and versions for this project are documented in this file.
> Any agent (including Claude Code) modifying or setting up this project should read this file first.
> See also: `CLAUDE.md` for agent-specific instructions.

## Project Overview

Zen Capsule is a focus-protection system that intercepts notifications during focus sessions, classifies their urgency with AI (Claude), and only lets truly urgent messages break through. Everything else is batched and presented in a summary during break time.

**Platforms**: Android (React Native) · Chrome Extension · Backend API (Fastify + PostgreSQL)

---

## Architecture

```
zen-capsule/                          # npm workspaces monorepo
├── packages/backend/                 # Fastify API + Prisma + PostgreSQL
│   ├── src/index.ts                  # Server entry (CORS, security, graceful shutdown)
│   ├── src/routes/auth.ts            # Register, login, refresh, logout, change password, delete account
│   ├── src/routes/focus.ts           # Focus session CRUD + session report
│   ├── src/routes/ai.ts              # AI analysis, feedback, whitelist, app rules, export
│   ├── src/routes/billing.ts         # Billing status endpoint
│   ├── src/routes/sync.ts            # Cross-device state polling
│   ├── src/services/urgency.service.ts  # Claude AI prompt + analysis
│   ├── src/services/usage.service.ts    # Plan-aware daily usage limits
│   └── prisma/schema.prisma          # Database schema
├── packages/mobile/                  # React Native Android app
│   ├── src/screens/                  # 4 screens: Login, Focus, History, Settings
│   ├── src/screens/BreakReportScreen.tsx  # Intercept report (opened from History)
│   ├── src/components/ErrorBoundary.tsx   # Global crash catcher
│   ├── src/services/api.ts           # API client + token management
│   ├── src/services/notificationService.ts  # Android native bridge
│   ├── src/navigation/               # React Navigation (3 tabs + stack)
│   └── android/                      # Kotlin notification listener
├── packages/shared/                  # Shared types, API client factory, endpoints
└── packages/extension/               # Chrome Extension (Manifest V3, Gmail blocking)
```

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **Focus Timer** | Set duration (25/45/60/90 min or custom), countdown with pulse animation |
| **AI Notification Analysis** | Claude Haiku scores every notification 0-100, classifies into 5 categories |
| **Keyword Fast-Path** | Keywords like "掛了/crashed/urgent" bypass AI (90pt, saves API calls), still logged to DB |
| **Smart Breakthrough** | Score >= 80 + whitelisted/boss/family senders break through with vibration |
| **Break Report** | Post-focus summary grouped by urgency (🔴 緊急 / 🟡 重要 / 🟠 普通 / 💬 社群 / 🛒 廣告) |
| **User Feedback** | Thumbs up/down on each AI decision for training data |
| **Whitelist + Relationships** | Tag senders as boss/client/family/friend/coworker for score boosting |
| **App Rules** | Block/allow entire apps (Shopee, Instagram) without AI, saving API calls |
| **Unified History** | 3-tab layout (Focus / History / Settings), tap any session to see its intercept report |
| **Freemium Billing** | FREE: 30 analyses/day, PRO ($4.99/mo): 500 analyses/day |
| **Password Change** | Change password from Settings, revokes all sessions |
| **Account Deletion** | GDPR-compliant permanent data deletion |
| **Error Boundary** | Catches any screen crash, shows retry UI instead of full app crash |
| **Audit Logging** | Logs login, logout, whitelist/app-rule changes, feedback |

### Security Features

| Feature | Description |
|---------|-------------|
| **Prompt Injection Defence** | User input sanitised + XML-tagged in AI prompts |
| **DB-Backed Login Lockout** | 10 failed attempts → 15 min lock (works across server instances) |
| **JWT Token Rotation** | 15-min access + 30-day refresh, auto-cleanup of expired sessions |
| **Token Refresh in Kotlin** | Native layer auto-refreshes expired tokens for uninterrupted interception |
| **CSP Headers** | Content-Security-Policy + X-Content-Type-Options + X-Frame-Options + HSTS |
| **Rate Limiting** | Global 100/min, analyse 30/min, export 5/hour, register 5/min |
| **Request Body Limit** | 100KB max payload |
| **Graceful Shutdown** | SIGTERM/SIGINT handlers close DB connections cleanly |
| **Network Security** | HTTPS-only in release builds, cleartext only for debug emulator |
| **BuildConfig API URL** | Debug → `http://10.0.2.2:3001`, Release → `https://api.zencapsule.com` |
| **ProGuard/R8** | Code shrinking + obfuscation enabled for release builds |
| **Release Signing Guard** | Warns if building release APK with debug keystore |

### UI Theme

Light cream background (`#FFF5EB`) with Claude orange (`#E8712A`) accents. Warm card surfaces (`#FFF0E0`) with subtle borders (`#E8D5C0`). Dark brown text (`#2D1B0E`).

---

## Recent Changelog

### 2026-03-22

#### UI/UX
- **Cream + Claude orange theme**: Replaced dark theme with light cream background (`#FFF5EB`) + Claude brand orange (`#E8712A`) across all screens, navigator, and Android native colors
- **Merged History + Messages tabs**: Reduced from 4 tabs to 3 (Focus / History / Settings). Tap any completed session in History to view its intercept report
- **Session cards show intercept count**: Each History card displays "📬 攔截 X 則" badge and "點擊查看 ▸" hint
- **Chinese UI**: Settings screen fully localized to Traditional Chinese

#### AI Inference Improvements
- **Enhanced AI prompt**: Added hourOfDay, sender relationship, app name, sender history context
- **App Rules**: always_block / always_allow / ask_ai per app (bypasses Claude API)
- **Relationship tags**: boss/client/family/friend/coworker on whitelist entries, with score boosting
- **Feedback UI**: Thumbs up/down buttons on each intercept entry in break report
- **Keyword notifications recorded to DB**: GCman's fix — keyword-matched notifications now call a lightweight log-only API endpoint instead of being invisible

#### Security Hardening
- **DB-backed login lockout**: Replaced in-memory Map with `LoginAttempt` model (survives server restart)
- **Password change + account deletion**: New endpoints + Settings UI
- **CSP header**: Added Content-Security-Policy to all responses
- **Request body limit**: 100KB max
- **Graceful shutdown**: SIGTERM/SIGINT handlers
- **Export rate limit**: 5 requests/hour
- **Focus session transaction**: Wrapped in `prisma.$transaction` to prevent race conditions
- **Database indexes**: Added on all foreign keys and common query patterns
- **Expired session cleanup**: Auto-cleans expired JWT sessions + old login attempts
- **Error Boundary**: Global React error catcher prevents full app crash
- **VIBRATE permission**: Fixed SecurityException crash on breakthrough notifications

#### Infrastructure
- **Freemium billing**: `User.plan` (FREE/PRO), plan-aware usage limits, `/billing/status` endpoint
- **Dead code removal**: Removed TaskBreakdown, Profile, Thought, Device, desktop package
- **BuildConfig API URL**: Debug/release URL switching in Kotlin native layer
- **Orphaned session 2-min threshold**: GCman's fix — prevents auto-closing sessions that just started
- **Token refresh order**: GCman's fix — API call before reading AsyncStorage ensures fresh tokens for Kotlin

---

## Environment Requirements

| Software | Required Version | Install |
|----------|-----------------|---------|
| **Node.js** | >= 22.x | `brew install node` |
| **PostgreSQL** | >= 14 | `brew install postgresql@16` |
| **Java (JDK)** | 17 | `brew install openjdk@17` |
| **Android SDK** | API 36 | Via Android Studio |
| **Android NDK** | 27.x | Via Android Studio SDK Manager |

### Required Environment Variables (Backend)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Cryptographically random (run `openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `PORT` | Server port (default: 3001) |
| `EXPORT_KEY` | Admin key for data export endpoints |

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
brew services start postgresql@16
createdb zen_capsule
cd packages/backend
npx prisma migrate dev
npx prisma generate
```

### 3. Environment Variables

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit .env with your values (no quotes around values!)
```

### 4. Build & Run

```bash
# Build shared package (required first)
npm -w packages/shared run build

# Start backend
npm run dev:backend

# Start Android emulator + app
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 &
cd packages/mobile && npx react-native run-android
```

### 5. Enable Notification Listener (Required!)

On the emulator/device: **Settings → Apps → Special app access → Notification access → Zen Capsule → ON**

Without this, notifications won't be intercepted.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/register | - | Create account |
| POST | /auth/login | - | Login (DB-backed lockout) |
| POST | /auth/refresh | - | Rotate tokens (10/min limit) |
| POST | /auth/logout | JWT | Revoke session |
| POST | /auth/change-password | JWT | Change password (revokes all sessions) |
| DELETE | /auth/account | JWT | Delete account + all data (GDPR) |
| POST | /focus/start | JWT | Start focus (transaction-safe) |
| POST | /focus/end | JWT | End focus session |
| GET | /focus/history | JWT | Paginated history |
| GET | /focus/session-report | JWT | Break-time notification summary |
| POST | /ai/analyse | JWT | AI urgency classification (supports keywordScore) |
| POST | /ai/feedback | JWT | User feedback on AI decision |
| GET/POST/DELETE | /ai/whitelist | JWT | Whitelist CRUD |
| GET/POST/DELETE | /ai/app-rules | JWT | App rules CRUD |
| GET | /ai/export | JWT + X-Export-Key | Training data (JSON, 5/hr limit) |
| GET | /ai/export/csv | JWT + X-Export-Key | Training data (CSV, 5/hr limit) |
| POST | /ai/summarise-emails | JWT | Batch email summary (Extension only) |
| GET | /billing/status | JWT | Plan, usage, limits |
| GET | /sync/state | JWT | Cross-device focus state |

---

## Freemium Model

| | FREE | PRO ($4.99/mo) |
|---|---|---|
| AI Analyses/day | 30 | 500 |
| Email Summaries/day | 2 | 20 |
| App Rules | 3 | Unlimited |
| Whitelist | 5 | Unlimited |
| Cost/user/month | ~$0.03 | ~$1.50 |

Plan is stored on `User.plan` (FREE/PRO) with `planExpiresAt`. Usage limits are enforced in `usage.service.ts` with Serializable transaction isolation.

Google Play Billing integration planned for subscription management.

---

## Database Schema (Key Models)

| Model | Purpose | Key Indexes |
|-------|---------|-------------|
| User | Account + plan (FREE/PRO) | email (unique) |
| Session | JWT refresh tokens | refreshToken (unique), userId, expiresAt |
| FocusSession | Focus timer sessions | userId, userId+endedAt |
| BehaviorLog | AI decision log | userId+createdAt, aiCategory+userAction |
| DailyUsage | Per-user daily counters | userId+date (unique) |
| Whitelist | Trusted senders + relationship | userId |
| AppRule | Per-app block/allow rules | userId+appName (unique) |
| LoginAttempt | DB-backed lockout | ip+createdAt, email+createdAt |

---

## Android Build

### Debug

```bash
cd packages/mobile/android
./gradlew assembleDebug
```

### Release

Requires signing config in `~/.gradle/gradle.properties`:

```properties
ZEN_RELEASE_STORE_FILE=../release.keystore
ZEN_RELEASE_STORE_PASSWORD=your-store-password
ZEN_RELEASE_KEY_ALIAS=zen-capsule
ZEN_RELEASE_KEY_PASSWORD=your-key-password
```

```bash
./gradlew assembleRelease
```

Release builds use HTTPS only (`api.zencapsule.com`). ProGuard/R8 enabled for code shrinking.

---

## Useful Commands

```bash
# Backend
npm run dev:backend                    # Hot-reload dev server (port 3001)

# Shared (rebuild after changes)
npm -w packages/shared run build

# Database
cd packages/backend
npx prisma migrate dev                 # Create + apply migration
npx prisma studio                      # GUI browser

# Android
~/Library/Android/sdk/platform-tools/adb logcat -s ReactNativeJS    # React Native logs
~/Library/Android/sdk/platform-tools/adb logcat -s ZenNotificationListener  # Kotlin listener logs
~/Library/Android/sdk/platform-tools/adb shell am force-stop com.zencapsuleapp
~/Library/Android/sdk/platform-tools/adb shell pm clear com.zencapsuleapp

# Test notifications (must be in focus mode + notification listener enabled)
~/Library/Android/sdk/platform-tools/adb shell "cmd notification post -S messaging --conversation 'Boss' --message 'Boss:Server is down urgent' -t 'Boss' tag1 'test'"
```

---

## Troubleshooting

**Backend won't start**: Check `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY` are set. Node's `--env-file` flag doesn't strip quotes — remove all quotes from `.env`.

**Notifications not intercepted**: Enable notification listener in Settings → Apps → Special app access → Notification access → Zen Capsule. Must toggle OFF then ON after reinstalling the app.

**Android "Unauthorized"**: JWT expired (15 min). App auto-refreshes, but if stuck: `adb shell pm clear com.zencapsuleapp`

**Metro white screen**: Force stop and reopen app. Dev-mode only issue.

**Shared changes not reflected**: Run `npm -w packages/shared run build`

**JAVA_HOME error**: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`

**Vibration crash**: Fixed in commit `aa1dd38`. Ensure `VIBRATE` permission is in AndroidManifest.xml.
