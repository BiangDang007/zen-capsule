# Zen Capsule 專案完整統整

> 最後更新：2026-03-06

---

## 一、專案架構總覽

```
zen-capsule/
├── zen-capsule-fullstack/      ← 後端 (Fastify + TypeScript + PostgreSQL + Prisma)
├── ZenCapsuleApp/              ← Android App (React Native 0.84.1)
├── zen-capsule-extension/      ← Chrome Extension (Manifest V3)
└── zen-capsule-desktop/        ← Mac Desktop App (Electron，尚未安裝完成)
```

---

## 二、後端 (zen-capsule-fullstack)

### 檔案結構

| 檔案 | 用途 |
|------|------|
| `src/index.ts` | Fastify 伺服器入口，CORS、JWT、Rate Limiting、路由註冊 `/api/v1` |
| `src/routes/auth.ts` | 認證路由：register / login / refresh / logout |
| `src/routes/focus.ts` | 專注時段 CRUD：start / end / history / thought |
| `src/routes/ai.ts` | AI 端點：analyse / feedback / export / summarise / breakdown / whitelist |
| `src/routes/sync.ts` | 跨裝置同步：device 註冊、state 輪詢、device 列表 |
| `src/services/urgency.service.ts` | Claude API 整合（Haiku 判斷緊急度、Sonnet 摘要/拆解任務） |
| `src/middleware/auth.ts` | JWT 驗證中介層 |
| `src/lib/prisma.ts` | Prisma Client 單例 |
| `prisma/schema.prisma` | 資料庫 Schema（User, FocusSession, Thought, BehaviorLog, Whitelist, Device） |

### 所有 API 端點

#### 認證 `/api/v1/auth`

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| POST | `/auth/register` | `{ email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password, deviceId? }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken? }` | `{ ok: true }` |

#### 專注時段 `/api/v1/focus`

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/focus/start` | `{ goal }` | `{ session }` |
| POST | `/focus/end` | `{ sessionId }` | `{ session }` |
| GET | `/focus/history?limit=10&offset=0` | — | `{ sessions[], total, totalMinutes }` |
| POST | `/focus/thought` | `{ content, sessionId? }` | `{ thought }` |
| GET | `/focus/thoughts` | — | `{ thoughts[] }` |

#### AI 分析 `/api/v1/ai`

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/ai/analyse` | `{ content, senderName?, subject?, preview?, repeatCount? }` | `{ result: { score, isUrgent, shouldBreakthrough, reason, category }, logId }` |
| POST | `/ai/feedback` | `{ logId, userAction }` | `{ ok: true }` |
| GET | `/ai/export?adminKey=` | — | `{ stats, data[] }` (訓練資料 JSON) |
| GET | `/ai/export/csv?adminKey=` | — | CSV 檔案下載 |
| POST | `/ai/summarise-emails` | `{ emails: [{ from, subject, preview }] }` | `{ summary: { urgent[], todo[], personal[], adsCount } }` |
| POST | `/ai/breakdown-task` | `{ goal, durationMinutes? }` | `{ breakdown: { steps[], totalMinutes } }` |
| GET | `/ai/whitelist` | — | `{ whitelist[] }` |
| POST | `/ai/whitelist` | `{ name, contact, priority? }` | `{ entry }` |
| DELETE | `/ai/whitelist/:id` | — | `{ ok: true }` |

#### 同步 `/api/v1/sync`

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/sync/device` | `{ name, platform, pushToken? }` | `{ device }` |
| GET | `/sync/state` | — | `{ phase, focusState, activeSession, todayStats, recentThoughts }` |
| GET | `/sync/devices` | — | `{ devices[] }` |
| DELETE | `/sync/device/:id` | — | `{ ok: true }` |

#### 其他

| Method | Path | 用途 |
|--------|------|------|
| GET | `/health` | 健康檢查（不需認證） |

---

## 三、Android App (ZenCapsuleApp)

### 檔案結構

| 檔案 | 用途 | 串接的 API |
|------|------|-----------|
| `App.tsx` | 根組件，包裹 AuthProvider + AppNavigator | — |
| `src/config/api.ts` | API 設定，DEV: `http://10.0.2.2:3000/api/v1` | — |
| `src/contexts/AuthContext.tsx` | 認證狀態管理，AsyncStorage 儲存 token | `POST /auth/register`, `POST /auth/login` |
| `src/services/api.ts` | 統一 API 客戶端，Bearer token 認證 | 所有端點（見下方對照表） |
| `src/navigation/AppNavigator.tsx` | 條件式導航：未登入→Login，已登入→Tabs | — |
| `src/screens/LoginScreen.tsx` | 登入/註冊畫面 | `POST /auth/login`, `POST /auth/register` |
| `src/screens/FocusScreen.tsx` | 專注計時器，25/45/60/90 分鐘預設 | `POST /focus/start`, `POST /focus/end` |
| `src/screens/HistoryScreen.tsx` | 歷史紀錄，下拉刷新 | `GET /focus/history` |
| `src/screens/SettingsScreen.tsx` | 白名單管理、登出 | `GET /ai/whitelist`, `POST /ai/whitelist`, `DELETE /ai/whitelist/:id` |
| `src/services/notificationService.ts` | 原生通知服務 JS 橋接 | — (透過 Kotlin 原生呼叫) |

### Kotlin 原生檔案（Android 通知攔截）

| 檔案 | 用途 | 串接的 API |
|------|------|-----------|
| `ZenNotificationListener.kt` | NotificationListenerService，攔截 10 款 App 的通知，2 階段緊急判定 | `POST /ai/analyse` |
| `ZenNotificationModule.kt` | React Native Bridge，暴露原生方法給 JS | — |
| `ZenNotificationPackage.kt` | RN Package 註冊 | — |
| `MainApplication.kt` | 註冊 ZenNotificationPackage | — |
| `AndroidManifest.xml` | 宣告 NotificationListenerService 權限 | — |

### 監控的 App（通知攔截）

Messenger, Facebook, Instagram, TikTok, Threads, Gmail, WhatsApp, Twitter/X, LINE, Telegram

---

## 四、Chrome Extension (zen-capsule-extension)

### 檔案結構

| 檔案 | 用途 | 串接的 API |
|------|------|-----------|
| `manifest.json` | V3 Manifest，權限：notifications/storage/tabs/alarms/declarativeNetRequest | — |
| `background.js` | Service Worker：每 10 秒輪詢狀態、2 階段 email 緊急判定、5 分鐘 Gmail 臨時解鎖 | `GET /sync/state`, `POST /ai/analyse` |
| `content.js` | Gmail DOM 注入：攔截通知 API、隱藏未讀徽章、注入防護橫幅、提取信件內容 | — (透過 chrome.runtime.sendMessage) |
| `popup.js` | 4 個畫面：login / setup / active / break，SVG 環形計時器 | `POST /auth/login`, `POST /focus/start`, `POST /focus/end`, `POST /ai/summarise-emails` |
| `popup.html` | 深色主題 UI（320px，Space Mono 字體） | — |
| `block.js` | 封鎖頁面邏輯，2 步驟確認才能覆蓋 | — |
| `block.html` | 全螢幕封鎖頁面 | — |
| `rules.json` | 7 條 declarativeNetRequest 規則，封鎖社群網站→重導至 block.html | — |

### 封鎖的網站

Gmail, Messenger, Instagram, Facebook, WhatsApp (web), Twitter/X

---

## 五、Mac Desktop App (zen-capsule-desktop) ⚠️ 尚未安裝 Electron

### 檔案結構

| 檔案 | 用途 | 串接的 API |
|------|------|-----------|
| `src/main/main.js` | Electron 主程序：Tray 選單列、無邊框視窗、IPC、防止專注中關閉 | — |
| `src/main/focus-engine.js` | 專注引擎：lockdown 模式、倒計時、自動恢復、AI 穿透判定 | `POST /focus/start`, `POST /focus/{id}/end`, `POST /ai/analyse` |
| `src/main/hosts-blocker.js` | 修改 `/etc/hosts` 系統級封鎖（需 sudo） | — |
| `src/main/macos-focus.js` | macOS DND 控制（AppleScript + Shortcuts） | — |
| `src/main/preload.js` | contextBridge 暴露 zenAPI | — |
| `src/renderer/index.html` | 4 個畫面：login / setup / focus / complete | — |
| `src/renderer/app.js` | UI 邏輯：認證、計時器、即時更新 | `POST /auth/login`, `POST /auth/register` |
| `src/shared/config.js` | 封鎖域名列表、API URL、緊急關鍵字、預設時間 | — |

---

## 六、API 串接對照表（誰在呼叫哪個 API）

| API 端點 | Android App | Chrome Extension | Mac Desktop |
|----------|:-----------:|:----------------:|:-----------:|
| `POST /auth/register` | AuthContext.tsx | — | app.js |
| `POST /auth/login` | AuthContext.tsx | popup.js | app.js |
| `POST /auth/refresh` | (api.ts 有定義) | — | — |
| `POST /auth/logout` | (api.ts 有定義) | — | — |
| `POST /focus/start` | FocusScreen.tsx | popup.js | focus-engine.js |
| `POST /focus/end` | FocusScreen.tsx | popup.js | focus-engine.js |
| `GET /focus/history` | HistoryScreen.tsx | — | — |
| `POST /focus/thought` | (api.ts 有定義) | — | — |
| `POST /ai/analyse` | ZenNotificationListener.kt | background.js | focus-engine.js |
| `POST /ai/feedback` | (api.ts 有定義) | — | — |
| `POST /ai/summarise-emails` | (api.ts 有定義) | popup.js | — |
| `POST /ai/breakdown-task` | (api.ts 有定義) | — | — |
| `GET /ai/whitelist` | SettingsScreen.tsx | — | — |
| `POST /ai/whitelist` | SettingsScreen.tsx | — | — |
| `DELETE /ai/whitelist/:id` | SettingsScreen.tsx | — | — |
| `GET /sync/state` | (api.ts 有定義) | background.js | — |
| `POST /sync/device` | (api.ts 有定義) | — | — |

> **備註**：「有定義」表示 api.ts 中已寫好函式但目前畫面尚未呼叫，未來可以直接串接。

---

## 七、資料庫 Schema 摘要

| Model | 主要欄位 | 用途 |
|-------|---------|------|
| **User** | id, email, passwordHash | 使用者帳號 |
| **FocusSession** | id, userId, goal, startedAt, endedAt, durationSeconds, interceptCount, phase | 專注時段紀錄 |
| **Thought** | id, userId, content, sessionId? | 快速想法捕捉 |
| **BehaviorLog** | aiScore, aiCategory, userAction, senderEmail, subject... | AI 訓練資料（決策+回饋） |
| **Whitelist** | id, userId, name, contact, priority | VIP 聯絡人（一律穿透） |
| **Device** | id, userId, name, platform, pushToken | 跨裝置同步用 |
| **Session** | id, userId, refreshToken, expiresAt | JWT Refresh Token |

---

## 八、目前狀態與待辦

| 項目 | 狀態 | 備註 |
|------|------|------|
| 後端 localhost | ✅ 運行中 | `npm run dev` 在 port 3000 |
| Android App | ✅ 模擬器運行中 | 登入修復完成（accessToken） |
| Chrome Extension | ✅ 已開發完成 | 需載入 Chrome 測試 |
| Mac Desktop | ⚠️ 卡在 Electron 安裝 | 網路 ECONNRESET 問題 |
| Railway 部署 | ❌ 尚未設定 | 需要 Railway 帳號 + 設定 |
| Android 通知攔截測試 | ❌ 尚未測試 | 程式碼已寫好，需 build 測試 |
