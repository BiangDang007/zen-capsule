# 🧘 Zen Capsule — Backend API

Node.js + Fastify + PostgreSQL + Prisma + Claude AI

---

## 快速啟動

```bash
# 1. 安裝依賴
npm install

# 2. 複製環境變數
cp .env.example .env
# 填入 DATABASE_URL 和 ANTHROPIC_API_KEY

# 3. 建立資料庫 + migrate
npm run db:migrate

# 4. 啟動開發伺服器
npm run dev
# → http://localhost:3000
```

---

## API 文件

Base URL: `http://localhost:3000/api/v1`

所有需要認證的路由請帶上 Header：
```
Authorization: Bearer <accessToken>
```

---

### 🔐 Auth

#### `POST /auth/register`
```json
{ "email": "user@example.com", "password": "min8chars" }
```
回傳：`{ user, accessToken, refreshToken }`

#### `POST /auth/login`
```json
{ "email": "...", "password": "...", "deviceId": "optional" }
```
回傳：`{ user, accessToken, refreshToken }`

#### `POST /auth/refresh`
```json
{ "refreshToken": "..." }
```
回傳新的 `{ accessToken, refreshToken }`（舊 token 立即失效）

#### `POST /auth/logout` 🔒
```json
{ "refreshToken": "..." }
```

---

### 🎯 Focus Sessions

#### `POST /focus/start` 🔒
開始一個專注階段，同時廣播給所有裝置。
```json
{ "goal": "完成 Zen Capsule 提案" }
```

#### `POST /focus/end` 🔒
結束專注，切換為 BREAK 狀態。
```json
{ "sessionId": "clx..." }
```

#### `GET /focus/history?limit=10&offset=0` 🔒
取得歷史專注紀錄 + 統計。

#### `POST /focus/thought` 🔒
Alt+S 快速靈感捕捉。
```json
{ "content": "記得問 Alex 關於 API 設計", "sessionId": "optional" }
```

#### `GET /focus/thoughts` 🔒
取得所有靈感紀錄。

---

### 🤖 AI 緊急判斷

#### `POST /ai/analyse` 🔒
核心功能：判斷訊息是否需要穿透專注盾。

```json
{
  "content": "系統整個掛了幫我看一下！！！",
  "senderName": "PM Alex",
  "senderContact": "alex@company.com",
  "repeatCount": 5
}
```

回傳：
```json
{
  "result": {
    "score": 95,
    "isUrgent": true,
    "shouldBreakthrough": true,
    "reason": "系統故障緊急情況，發送者為白名單成員，連環傳訊觸發穿透",
    "category": "critical"
  }
}
```

**評分邏輯：**
| 分數 | 類別 | 處理 |
|------|------|------|
| 80–100 | critical | 立即穿透 |
| 50–79 | important | 休息時顯示 |
| 20–49 | normal | 休息摘要 |
| 0–19 | social | 略過 |

#### `GET /ai/whitelist` 🔒
取得白名單列表。

#### `POST /ai/whitelist` 🔒
新增白名單聯絡人。
```json
{ "name": "老闆", "contact": "boss@company.com", "priority": 10 }
```

#### `DELETE /ai/whitelist/:id` 🔒
移除白名單聯絡人。

---

### 📱 跨裝置同步

#### `POST /sync/device` 🔒
註冊裝置（安裝擴充功能 / App 時呼叫）。
```json
{
  "name": "Chrome · MacBook Pro",
  "platform": "CHROME",
  "pushToken": "optional-for-push-notifications"
}
```

#### `GET /sync/state` 🔒
**手機 App 每 10 秒輪詢此 endpoint**，取得當前專注狀態。

回傳：
```json
{
  "phase": "FOCUS",
  "activeSession": {
    "id": "clx...",
    "goal": "完成提案",
    "startedAt": "2025-01-01T10:00:00Z",
    "durationSeconds": 3417,
    "interceptCount": 7
  },
  "todayStats": {
    "totalMinutes": 142,
    "sessionsCount": 3,
    "totalInterceptions": 23
  },
  "recentThoughts": [...]
}
```

#### `GET /sync/devices` 🔒
取得所有已登入裝置列表。

#### `DELETE /sync/device/:id` 🔒
移除裝置。

---

## 資料庫 Schema

```
User ──┬── Profile (設定)
       ├── Session (refresh tokens)
       ├── Device (已登入裝置)
       ├── FocusSession (專注紀錄)
       ├── Thought (靈感保險箱)
       └── Whitelist (緊急聯絡人)
```

---

## 技術決策筆記

| 決策 | 選擇 | 原因 |
|------|------|------|
| Framework | Fastify | Express 快 3–4x，schema 驗證內建 |
| ORM | Prisma | Type-safe，migration 管理清晰 |
| AI | Claude Haiku | 速度快、成本低，適合即時判斷 |
| Auth | JWT + Refresh Rotation | Stateless + 安全 token 輪換 |
| Sync | 輪詢 (MVP) → WebSocket (v2) | 快速實作，升級路徑清楚 |

---

## 下一步 (Post-MVP)

- [ ] WebSocket 即時同步（取代輪詢）
- [ ] Gmail OAuth 整合（直接抓取信件摘要）
- [ ] Stripe 訂閱付款
- [ ] Redis 快取（rate limit + session store）
- [ ] Docker Compose 一鍵部署
