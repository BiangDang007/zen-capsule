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
│   ├── src/routes/auth.ts            # Register, login, refresh, logout
│   ├── src/routes/focus.ts           # Focus session CRUD + session report
│   ├── src/routes/ai.ts              # AI analysis, feedback, whitelist, app rules, export
│   ├── src/routes/billing.ts         # Billing status endpoint
│   ├── src/routes/sync.ts            # Cross-device state polling
│   ├── src/services/urgency.service.ts  # Claude AI prompt + analysis
│   ├── src/services/usage.service.ts    # Plan-aware daily usage limits
│   └── prisma/schema.prisma          # Database schema
├── packages/mobile/                  # React Native Android app
│   ├── src/screens/                  # 5 screens: Login, Focus, History, BreakReport, Settings
│   ├── src/services/api.ts           # API client + token management
│   ├── src/services/notificationService.ts  # Android native bridge
│   ├── src/navigation/               # React Navigation (bottom tabs)
│   └── android/                      # Kotlin notification listener
├── packages/shared/                  # Shared types, API client factory, endpoints
└── packages/extension/               # Chrome Extension (Manifest V3, Gmail blocking)
```

---

## Features

### Core Features (Actively Used)

| Feature | Description |
|---------|-------------|
| **Focus Timer** | Set duration (25/45/60/90 min or custom), countdown with pulse animation |
| **AI Notification Analysis** | Claude Haiku scores every notification 0-100, classifies into 5 categories |
| **Smart Breakthrough** | Only score >= 80 + whitelisted/boss/family senders break through |
| **Break Report** | Post-focus summary grouped by urgency, with AI reason display |
| **User Feedback** | Thumbs up/down on each AI decision for training data |
| **Whitelist + Relationships** | Tag senders as boss/client/family/friend/coworker for score boosting |
| **App Rules** | Block/allow entire apps (Shopee, Instagram) without AI, saving API calls |
| **Freemium Billing** | FREE: 30 analyses/day, PRO ($4.99/mo): 500 analyses/day |

### Security Features

| Feature | Description |
|---------|-------------|
| **Prompt Injection Defence** | User input sanitised + XML-tagged in AI prompts |
| **DB-Backed Login Lockout** | 10 failed attempts → 15 min lock (works across server instances) |
| **JWT Token Rotation** | 15-min access + 30-day refresh, auto-cleanup of expired sessions |
| **CSP Headers** | Content-Security-Policy + X-Content-Type-Options + X-Frame-Options + HSTS |
| **Rate Limiting** | Global 100/min, analyse 30/min, export 5/hour, register 5/min |
| **Request Body Limit** | 100KB max payload |
| **Graceful Shutdown** | SIGTERM/SIGINT handlers close DB connections cleanly |
| **Network Security** | HTTPS-only in release builds, cleartext only for debug emulator |
| **Release Signing Guard** | Warns if building release APK with debug keystore |

### UI Theme

Light cream background (#FAF6F1) with Claude orange (#E8734A) accents. White card surfaces with subtle shadows. Dark brown text (#2A1810).

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

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/register | - | Create account |
| POST | /auth/login | - | Login (DB-backed lockout) |
| POST | /auth/refresh | - | Rotate tokens (10/min limit) |
| POST | /auth/logout | JWT | Revoke session |
| POST | /focus/start | JWT | Start focus (transaction-safe) |
| POST | /focus/end | JWT | End focus session |
| GET | /focus/history | JWT | Paginated history |
| GET | /focus/session-report | JWT | Break-time notification summary |
| POST | /ai/analyse | JWT | AI urgency classification |
| POST | /ai/feedback | JWT | User feedback on AI decision |
| GET/POST/DELETE | /ai/whitelist | JWT | Whitelist CRUD |
| GET/POST/DELETE | /ai/app-rules | JWT | App rules CRUD |
| GET | /ai/export | JWT + X-Export-Key | Training data (JSON, 5/hr limit) |
| GET | /ai/export/csv | JWT + X-Export-Key | Training data (CSV, 5/hr limit) |
| POST | /ai/summarise-emails | JWT | Batch email summary (Extension only) |
| GET | /billing/status | JWT | Plan, usage, limits |
| GET | /sync/state | JWT | Cross-device focus state |
| GET | /health | - | DB connectivity check |

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

The `/billing/status` endpoint returns current plan, today's usage, and limits.

---

## Database Schema (Key Models)

| Model | Purpose | Key Indexes |
|-------|---------|-------------|
| User | Account + plan | email (unique) |
| Session | JWT refresh tokens | refreshToken (unique), userId, expiresAt |
| FocusSession | Focus timer sessions | userId, userId+endedAt |
| BehaviorLog | AI decision log | userId+createdAt, aiCategory+userAction |
| DailyUsage | Per-user daily counters | userId+date (unique) |
| Whitelist | Trusted senders | userId |
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
~/Library/Android/sdk/platform-tools/adb shell am force-stop com.zencapsuleapp
~/Library/Android/sdk/platform-tools/adb shell pm clear com.zencapsuleapp

# Test notification
~/Library/Android/sdk/platform-tools/adb shell cmd notification post -S messaging -t "Boss" "tag1" "Server is down!"
```

---

## Troubleshooting

**Backend won't start**: Check `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY` are set. Node's `--env-file` flag doesn't strip quotes — remove all quotes from `.env`.

**Android "Unauthorized"**: JWT expired (15 min). App auto-refreshes, but if stuck: `adb shell pm clear com.zencapsuleapp`

**Metro white screen**: Force stop and reopen app. Dev-mode only issue.

**Shared changes not reflected**: Run `npm -w packages/shared run build`

**JAVA_HOME error**: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
