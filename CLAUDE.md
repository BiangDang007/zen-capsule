# CLAUDE.md — Agent Instructions for Zen Capsule

> This file is for all Claude Code agents working on this project.
> Read this file first before making any changes.

## Golden Rule

**All environment settings, software versions, and setup instructions are documented in `README.md`.**
If you change any dependency version, add a new tool, or modify the environment setup,
**you MUST update `README.md` accordingly.**

---

## Project Structure

```
zen-capsule/                          # npm workspaces monorepo
├── packages/backend/                 # Fastify API + Prisma + PostgreSQL
│   ├── src/index.ts                  # Server entry point
│   ├── src/routes/                   # Route handlers (auth, focus, ai, sync)
│   ├── src/services/                 # Business logic (urgency AI, usage tracking)
│   ├── src/middleware/               # Auth middleware
│   ├── src/lib/                      # Prisma client instance
│   ├── prisma/schema.prisma          # Database schema
│   └── .env                          # Environment variables (NOT committed)
├── packages/mobile/                  # React Native Android app
│   ├── src/screens/                  # Screen components
│   ├── src/contexts/                 # React contexts (Auth)
│   ├── src/services/api.ts           # API client config
│   ├── src/navigation/               # React Navigation setup
│   └── android/                      # Native Android code (Kotlin)
├── packages/shared/                  # Shared types + API client
│   └── src/                          # Types, endpoints, client factory
├── packages/extension/               # Chrome Extension (Manifest V3)
└── packages/desktop/                 # Electron Mac menu-bar app
```

---

## Critical Workflows

### After modifying `packages/shared/`

Always rebuild:

```bash
npm -w packages/shared run build
```

Mobile and backend import from shared's `dist/` — changes won't take effect without a rebuild.

### After modifying Prisma schema

```bash
npm run db:migrate    # Create migration
npm run db:generate   # Regenerate Prisma client
```

### Starting the dev environment

1. PostgreSQL must be running: `brew services start postgresql@16`
2. Start backend: `npm run dev:backend` (or with explicit env exports if `.env` loading fails)
3. Start emulator: `~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 &`
4. Start mobile: `cd packages/mobile && npx react-native run-android`

### Backend port

The backend runs on **port 3001** (not 3000). The mobile app's `api.ts` points to `http://10.0.2.2:3001`.

---

## Environment Details

### Key Paths (macOS Apple Silicon)

| Path | Purpose |
|------|---------|
| `~/Library/Android/sdk` | Android SDK |
| `~/Library/Android/sdk/emulator/emulator` | Emulator binary |
| `~/Library/Android/sdk/platform-tools/adb` | ADB binary |
| `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home` | JAVA_HOME |

### Required env vars for backend

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `ANTHROPIC_API_KEY` | Claude API key (from console.anthropic.com) |
| `PORT` | Server port (default: 3001) |
| `EXPORT_KEY` | Admin key for data export endpoints |

### Android emulator networking

Inside the Android emulator, `10.0.2.2` maps to the host machine's `localhost`.
The mobile app is configured to use `http://10.0.2.2:3001` in development.

---

## Coding Conventions

### Backend

- **Framework**: Fastify with TypeScript (ESM modules)
- **Validation**: Zod schemas for all request bodies — always add `.max()` length limits
- **ORM**: Prisma — use transactions for concurrent operations
- **Auth**: JWT with 15-minute access tokens + 30-day refresh tokens
- **Rate limiting**: Per-route via `config.rateLimit` in route options
- **AI prompts**: Wrap all user input in XML tags (`<user_content>`, `<user_sender>`, etc.) to prevent prompt injection. System prompts must instruct Claude to treat XML tag content as DATA only.
- **Error handling**: Global error handler hides stack traces in production
- **Export endpoints**: Use `X-Export-Key` header (NOT query parameters) for admin authentication

### Mobile (React Native)

- **Navigation**: React Navigation 7 (bottom tabs + native stack)
- **State**: React hooks + Context API
- **API client**: Shared package's `createApiClient()` with AsyncStorage token management
- **Token refresh**: Auto-refresh on 401 errors via `tryRefreshToken()` in `api.ts`
- **Tab data**: Use `useFocusEffect` (not `useEffect`) for screens in tab navigators — otherwise data only loads once on mount

### Shared Package

- ESM module (`"type": "module"`)
- Exports types, API endpoints, and `createApiClient` factory
- Must be rebuilt (`npm -w packages/shared run build`) after any change

---

## Known Issues & Gotchas

1. **Node.js `--env-file` flag** doesn't strip quotes from values. Either remove quotes in `.env` or export vars directly in shell.
2. **Node.js `--env-file`** with relative paths sometimes fails to load values. Use absolute paths or export directly.
3. **JWT tokens expire in 15 minutes**. The mobile app auto-refreshes, but if testing manually via curl, you'll need to call `/auth/refresh`.
4. **Metro bundler white screen**: Can happen during heavy API usage in dev mode. Force-stop and restart the app.
5. **`adb` and `emulator` commands** may not be in PATH. Use absolute paths: `~/Library/Android/sdk/platform-tools/adb`.
6. **zsh `export`** sometimes fails with "not valid in this context" when combined with complex strings. Use separate export statements.

---

## Security Rules

These are already implemented. Do NOT remove or weaken them:

1. **Prompt injection protection**: All user input in AI prompts is wrapped in XML tags + sanitised (< > replaced with fullwidth chars)
2. **Global error handler**: 500 errors hide internal details in production
3. **Export auth via header**: `X-Export-Key` header, never in URL query params
4. **Pagination limits**: All paginated endpoints clamp `limit` to 1–100
5. **Field length limits**: All Zod string fields have `.max()` validators
6. **Race condition protection**: Usage limit check uses Prisma `$transaction` with Serializable isolation
7. **CSV injection defence**: Export CSV cells starting with `=+\-@` are prefixed with `'`
8. **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `HSTS` (production)
9. **API key server-side only**: `ANTHROPIC_API_KEY` never exposed to client
10. **`.env` in `.gitignore`**: Secrets never committed

---

## Testing with Android Emulator

### Send test notifications via adb

```bash
# Send a test notification
adb shell cmd notification post -S messaging -t "Title" "tag1" "Message body"

# Send to specific channel
adb shell cmd notification post -S messaging --channel default -t "Boss" "urgent1" "Server is down!"
```

### Test API directly via curl

```bash
# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"12345678"}'

# Analyse notification (use token from login response)
curl -X POST http://localhost:3001/api/v1/ai/analyse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"content":"Server is down!","senderName":"Boss","senderContact":"boss@company.com"}'
```

### Useful adb commands

```bash
adb devices                                    # List connected devices
adb shell uiautomator dump                     # Dump UI tree for coordinates
adb shell input tap <x> <y>                    # Tap screen
adb shell input text "hello"                   # Type text
adb shell am force-stop com.zencapsuleapp      # Force stop app
adb shell pm clear com.zencapsuleapp           # Clear app data
adb logcat -s ReactNativeJS                    # View React Native logs
```
