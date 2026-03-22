# Zen Capsule 開發紀錄 — 2026-03-22

> 本文件記錄 2026-03-16 至 2026-03-22 開發週期內的所有變更、技術討論與決策。

---

## 本次工作總覽

- **UI 大改版**：從深色暖色調切換為奶油色背景 + Claude 橘色主題；將四個 Tab 合併為三個（歷史 + 訊息合一）
- **AI 推論管線強化**：加入時間、寄件人關係、App 名稱等上下文；新增 App 規則系統（免 AI 直接判定）
- **安全性全面加固**：DB-backed 登入鎖定、JWT 不再有 fallback、CSP header、request body 限制、資料庫索引
- **Freemium 計費架構**：FREE / PRO 方案分級、用量追蹤、帳單狀態 API
- **帳號管理功能**：密碼修改、帳號刪除（GDPR 合規）、稽核日誌、Error Boundary
- **死碼大清理**：移除 Desktop 套件、Profile model、Quick Thoughts、Device CRUD 等未使用功能
- **GCman 關鍵修復**：JWT Token 刷新流程、Keyword 通知寫入 DB、Fabric 崩潰修復、孤兒 Session 自動關閉
- **文件更新**：README 全面改寫反映當前架構與功能

---

## 程式碼變更（依類別整理）

### UI 介面

#### 奶油色背景 + Claude 橘色主題（`ce93a33`）
原本的深色暖色調不夠清爽，改為淺色奶油背景配 Claude 品牌橘色。全面影響 6 個畫面、導航列、App.tsx 與 Android 原生的 `colors.xml` / `styles.xml`。

- 背景色：`#FFF5EB`（奶油）、卡片：`#FFF0E0`
- 主色調：`#E8712A`（Claude 橘）
- 文字：`#2D1B0E`（深棕色）
- 狀態列圖示改為深色以配合淺色背景

#### 歷史 + 訊息合併為單一 Tab（`69f10d9`）
使用者反映四個 Tab 太多，且「訊息」與「歷史」資訊重疊。將兩者合併後只剩三個 Tab（專注、歷史、設定），歷史卡片改為可點擊展開該次專注的攔截報告，顯示攔截次數 badge 與「點擊查看 ▸」提示。在 History Tab 內建立 Stack Navigator 處理列表→詳情的導航。

#### Fabric 崩潰修復（`a4255a8`，GCman）
Android Fabric 渲染引擎有多個相容性問題：
- `useFocusEffect` 在初次 mount 時觸發 `setState`，與 Fabric 的 view tree commit 產生 race condition → 用 `InteractionManager` 延遲首次 fetch
- 原生 `Switch` 元件在 Fabric 上崩潰 → 改用自製 `Animated.View` Toggle
- CSS `gap` 屬性在 Android Fabric 不支援 → 全面改用 `margin`
- `flexWrap: 'wrap'` 造成 Fabric layout 崩潰 → 手動分割 chip 列

#### VIBRATE 權限（`aa1dd38`）
突破通知觸發震動時因缺少 `android.permission.VIBRATE` 而拋出 `SecurityException` 導致 App 崩潰。加入權限宣告即修復。

### AI 推論與回饋

#### AI 推論管線增強 + App 規則（`c75a5cc`）
- AI 提示詞加入 `hourOfDay`、寄件人關係、App 名稱、寄件人歷史紀錄，讓評分更具上下文
- 新增 App Rules（`always_block` / `always_allow` / `ask_ai`），已知 App（如 Shopee、Instagram）可直接判定不需呼叫 Claude API，節省 API 費用
- 白名單新增關係標籤（boss / client / family / friend / coworker / other），AI 會根據關係加權評分
- 專注報告回傳 `logId` + `aiReason`，支援使用者反饋
- BreakReportScreen 加入 thumbs up/down 回饋按鈕
- SettingsScreen 新增關係選擇器與 App Rules CRUD 介面（中文 UI）

#### Keyword 通知寫入 DB（`50835cf`，GCman）
原本 keyword 匹配的通知只在前端處理，不會記錄到資料庫。新增 `keywordScore` 參數到 `/ai/analyse`，keyword 匹配的通知跳過 Claude AI 但仍寫入 `BehaviorLog`，既省 API 呼叫又讓訊息頁面能顯示所有通知。Kotlin 層新增 `doLogOnlyRequest` 輕量 API 呼叫處理 keyword 匹配。

### 安全性與基礎架構

#### 生產環境安全加固 + Freemium 計費（`07d54ca`）
這是本次最大的基礎架構提交，分為三大區塊：

**嚴重等級修復：**
- 登入鎖定改用資料庫（原本用 in-memory `Map`，重啟即失效）
- 移除 JWT secret 的 fallback 值，強制要求環境變數設定
- Android API URL 改用 `BuildConfig` 區分 debug / release
- 生產環境 URL 設為 `api.zencapsule.com`
- `network_security_config` 限制 cleartext 僅在 debug build
- Release build 偵測到 debug keystore 時發出警告
- 全域 request body 限制 100KB

**高等級修復：**
- 所有 `userId` 外鍵加上資料庫索引（大幅提升查詢效能）
- Focus session 建立改用 transaction 包裹
- Export endpoint 限速 5 次/小時
- 過期 session 與登入嘗試定期清理
- CSP（Content Security Policy）header
- Health check endpoint 含 DB 連線檢查
- 優雅關機處理（SIGTERM / SIGINT）

**Freemium 計費：**
- User model 新增 `Plan` enum（`FREE` / `PRO`）
- 依方案設定用量上限（FREE: 30次/天，PRO: 500次/天）
- `GET /billing/status` endpoint 回傳用量與上限
- 定價 $4.99/月

#### 密碼修改、帳號刪除、Error Boundary（`6b613b7`）
- `POST /auth/change-password`：需輸入當前密碼，成功後撤銷所有 session
- `DELETE /auth/account`：GDPR 合規帳號刪除，需密碼確認
- Error Boundary 包裹整個 App，崩潰時顯示重試畫面而非白屏
- 稽核日誌記錄：登入、登出、密碼修改、帳號刪除、白名單 CRUD、App Rules CRUD、AI 回饋、資料匯出

### 清理與維護

#### 死碼大清理（`573fe26`）
專案經過多次迭代累積了許多不再使用的功能：
- **Profile model**：註冊時建立但從未讀取/顯示
- **Quick Thoughts**：有 API（POST/GET `/focus/thought`）但無 mobile UI
- **Desktop 套件**：獨立 Electron 應用，未連接 API，整包刪除（含 5,660 行 `package-lock.json`）
- **Device CRUD**：POST/GET/DELETE `/sync/device`，從未被呼叫
- **ZEN_CAPSULE_PROJECT_OVERVIEW.md**：過時文件，已被 README 取代
- **Jest 設定 + 測試檔**：引用已刪除的 `jest.setup.js`

共移除約 7,843 行程式碼。

#### Task Breakdown 死碼移除（`32c6035`）
清除先前 migration 中已移除的 TaskBreakdown 功能殘留：shared types、client methods、service functions。

#### .gitignore 更新（`264d040`）
新增 Android build artifacts 到 .gitignore，避免 build 產出被意外提交。

---

## GCman 的貢獻

GCman（GitHub: @gclinian）在本次開發週期中做出了多項關鍵修復：

### JWT Token 刷新流程修正（`5b75647`）
**問題**：Kotlin `NotificationListener` 收到的 JWT token 可能已過期，導致通知攔截的 API 呼叫失敗，使用者必須重新登入才能恢復功能。

**解法**：將 `api.focus.start()` 的呼叫移到從 AsyncStorage 讀取 token **之前**。這樣如果 access token 已過期，`api.ts` 的 401 interceptor 會先自動刷新 token，確保傳給 Kotlin 層的永遠是有效 token。

### Keyword 通知寫入 DB + 多項穩定性修復（`50835cf`）
- **Keyword 通知記錄**：見上方 AI 區段說明
- **孤兒 Session 自動關閉加入 2 分鐘門檻**：原本的自動關閉邏輯會在 `useFocusEffect` 觸發時把剛建立的 session 也關掉（race condition），加入 2 分鐘門檻避免此問題
- **network_security_config 修正**：`debug-overrides` 單獨無法覆蓋 `base-config`，需使用 `domain-config` 明確允許 `10.0.2.2` 和 `localhost` 的 cleartext
- **startFocus token 流程**：401 時先嘗試刷新 token 再放棄
- **Debug logs**：在 `ZenNotificationModule` 新增 token 除錯日誌

### 孤兒 Session 自動關閉（`31ff775`）
**問題**：App 異常關閉時 focus session 不會被正常結束，導致 History 頁面出現永遠顯示「進行中」的幽靈 session。

**解法**：
- 後端 `/focus/history` 現在關閉**所有** `endedAt=null` 的 session（原本只關最近一個）
- 前端改用 `endedAt`（而非 `durationSeconds`）判斷 session 狀態，因為 `durationSeconds=0` 是 falsy，會讓已關閉的 session 仍顯示「進行中」

### Fabric 崩潰修復 + gap 替換（`a4255a8`）
見上方 UI 區段的詳細說明。

### Copilot PR 合併（`3c94eff`）
合併 GitHub Copilot 自動生成的 Jest 設定修復 PR，穩定 mobile 測試環境。

---

## 遇到的問題與解法

### 1. Kotlin NotificationListener 收到過期 Token
**現象**：開啟專注模式後通知攔截無作用，Kotlin 層的 API 呼叫返回 401。
**根因**：從 AsyncStorage 讀取 token 時，token 可能已在 15 分鐘前過期，但讀取動作不會觸發刷新。
**解法**：先呼叫 `api.focus.start()`（會觸發 401 interceptor 自動刷新），再讀取 token 傳給 Kotlin。

### 2. 孤兒 Session 的 Race Condition
**現象**：剛開啟專注模式的 session 立即被自動關閉。
**根因**：`useFocusEffect` 在 History tab 觸發時會呼叫後端關閉所有 `endedAt=null` 的 session，包括剛剛才建立的。
**解法**：加入 2 分鐘門檻，只自動關閉建立超過 2 分鐘的孤兒 session。

### 3. Android Fabric 渲染崩潰
**現象**：Settings tab 開啟時 App 崩潰，錯誤為 `addViewAt: child already has a parent`。
**根因**：React Native 新架構 Fabric 與部分 CSS 屬性和元件不相容。
**解法**：移除 `gap`（改用 margin）、移除 `flexWrap`（手動分列）、替換原生 Switch、延遲 setState。

### 4. 震動權限缺失導致崩潰
**現象**：突破通知觸發時 App 直接崩潰。
**根因**：Android 需要明確宣告 `VIBRATE` 權限。
**解法**：在 `AndroidManifest.xml` 加入 `<uses-permission android:name="android.permission.VIBRATE" />`。

### 5. Debug 模式 Cleartext 通訊失敗
**現象**：Android 模擬器無法連線到 `http://10.0.2.2:3001`。
**根因**：`network_security_config` 的 `debug-overrides` 無法單獨覆蓋 `base-config` 的 `cleartextTrafficPermitted="false"` 設定。
**解法**：使用 `domain-config` 明確對 `10.0.2.2` 和 `localhost` 允許 cleartext。

### 6. 登入鎖定重啟失效
**現象**：伺服器重啟後登入鎖定紀錄消失，暴力破解保護形同虛設。
**根因**：鎖定狀態存在 in-memory `Map` 中。
**解法**：改用資料庫表 `LoginAttempt` 儲存，重啟後紀錄仍在。

---

## 技術討論紀錄

### Race Condition 與 Atomic Operation

**議題**：多個請求同時檢查用量限制時，可能超過每日上限。

**分析**：
- 原本的用量檢查是「先讀後寫」（read-then-write），兩個同時到達的請求可能都讀到「還有 1 次」然後都通過。
- Prisma 的 `$transaction` 搭配 Serializable 隔離等級可以解決此問題，但 PostgreSQL 在 Serializable 模式下可能拋出 serialization error 需要重試。

**決策**：使用 Prisma `$transaction` 搭配 Serializable 隔離等級包裹用量檢查與遞增操作，確保原子性。在生產環境中遇到 serialization error 時讓用戶端重試。

### Google Play Billing vs Stripe

**議題**：行動應用的付費方案該用哪個支付系統？

**比較**：
| 面向 | Google Play Billing | Stripe |
|------|-------------------|--------|
| 抽成 | 15%（小型開發者）/ 30% | 2.9% + $0.30 |
| Play Store 合規 | 必須用於數位商品 | 僅限實體商品/服務 |
| 實作複雜度 | 需 Kotlin/Java 整合 | 純後端整合，較簡單 |
| 退款處理 | Google 自動處理 | 需自行處理 |

**決策**：由於 Zen Capsule 的 PRO 方案屬於 App 內數位功能解鎖，依 Google Play 政策**必須使用 Google Play Billing**。Stripe 只能用於非 App 內購的場景（如 Web 訂閱）。目前先建立計費架構（Plan enum + usage limits + billing status API），實際金流整合待後續實作。

### 部署方案

**議題**：後端部署到哪裡最合適？

**選項分析**：
1. **Railway / Render**：最簡單，Git push 即部署，適合初期。Railway 免費方案有限制但 $5/月 Hobby 方案足夠
2. **AWS EC2 / GCP Compute**：完整控制但運維成本高
3. **Fly.io**：邊緣部署，適合全球用戶，但對台灣市場可能過度設計
4. **Vercel**：不適合長時間運行的 Fastify 伺服器

**決策**：初期使用 Railway 或 Render 快速上線，設定域名 `api.zencapsule.com`。流量成長後再考慮遷移到 AWS/GCP。

### 成本分析

**議題**：每月運營成本估算？

**估算（以 1,000 活躍用戶為基準）：**
- PostgreSQL（Railway / Supabase Free Tier）：$0–$25/月
- 後端伺服器（Railway Hobby）：$5/月
- Anthropic API（Claude Haiku，平均每用戶每日 5 次）：約 $15–$30/月
- 域名 + SSL：$12/年
- **總計**：約 $20–$60/月

**關鍵節省策略**：
- App Rules 跳過已知 App 的 AI 呼叫
- Keyword 匹配直接判定不呼叫 AI
- 使用 Claude Haiku（而非 Sonnet/Opus）降低 per-call 成本
- FREE 方案每日 30 次上限控制 API 消耗

### 安全性考量

**已實施的安全措施（10 項）：**
1. Prompt injection 防護（XML tag 包裹 + 特殊字元替換）
2. 全域錯誤處理（生產環境隱藏堆疊追蹤）
3. Export 認證用 header（非 URL query parameter）
4. 分頁限制（1–100 筆）
5. 欄位長度限制（所有 Zod string 都有 `.max()`）
6. Race condition 防護（Serializable transaction）
7. CSV 注入防禦（`=+\-@` 前綴加 `'`）
8. Security headers（X-Content-Type-Options, X-Frame-Options, HSTS）
9. API Key 僅在伺服器端使用
10. `.env` 在 `.gitignore` 中

**本次新增：**
- DB-backed 登入鎖定
- JWT secret 無 fallback
- CSP header
- Request body 100KB 限制
- 資料庫索引優化
- 稽核日誌

---

## 目前狀態

### 已完成
- 核心功能完整：專注模式、通知攔截、AI 評分、歷史紀錄、設定管理
- UI 主題確定：奶油色 + Claude 橘色
- 三個 Tab 布局：專注、歷史、設定
- 安全性達生產等級
- Freemium 架構建立（計費邏輯完成，金流整合待做）
- 帳號管理功能完成（密碼修改、帳號刪除）
- 死碼全面清理完成
- README 與 CLAUDE.md 文件更新完畢

### 未提交的變更
目前工作目錄已完全 commit，無未提交的變更。

---

## 下一步待辦

### 高優先
1. **Google Play Billing 整合**：實作 Kotlin 端 BillingClient、後端驗證 purchase token、webhook 處理
2. **後端部署**：設定 Railway/Render，配置 `api.zencapsule.com` 域名與 SSL
3. **PostgreSQL 雲端資料庫**：設定 Supabase 或 Railway PostgreSQL
4. **Release APK 簽章**：生成正式 keystore，設定 Gradle signing config

### 中優先
5. **通知權限引導**：首次使用時引導用戶開啟 NotificationListener 權限
6. **Onboarding 流程**：新用戶首次使用教學
7. **PRO 方案 UI**：升級提示、付費牆、方案比較頁面
8. **推播通知**：FCM 整合，在非專注模式時推送重要通知摘要

### 低優先
9. **單元測試補齊**：後端 route handler 測試、前端 component 測試
10. **E2E 測試**：Detox 或 Maestro 自動化測試
11. **國際化（i18n）**：目前 UI 為中文硬編碼，未來支援英文等語言
12. **資料分析儀表板**：用戶行為分析、AI 準確度追蹤

---

## 提交紀錄總表

| Commit | 作者 | 說明 |
|--------|------|------|
| `882175d` | AlexanderTseng | README 全面更新 |
| `264d040` | AlexanderTseng | .gitignore 加入 Android build artifacts |
| `69f10d9` | AlexanderTseng | 歷史 + 訊息合併為單一 Tab |
| `aa1dd38` | AlexanderTseng | 加入 VIBRATE 權限修復崩潰 |
| `ce93a33` | AlexanderTseng | 奶油色背景 + Claude 橘色主題 |
| `50835cf` | GCman | Keyword 通知寫入 DB + 多項修復 |
| `5b75647` | GCman | JWT Token 刷新流程修正 |
| `5675304` | AlexanderTseng | README 新增帳號管理功能文件 |
| `6b613b7` | AlexanderTseng | 密碼修改、帳號刪除、Error Boundary |
| `573fe26` | AlexanderTseng | 死碼清理（移除 7,843 行） |
| `07d54ca` | AlexanderTseng | 生產安全加固 + Freemium 計費 |
| `31ff775` | GCman | 孤兒 Session 自動關閉 |
| `3c94eff` | GCman | 合併 Copilot Jest 修復 PR |
| `a4255a8` | GCman | Fabric 崩潰修復 + gap 替換 |
| `32c6035` | AlexanderTseng | 移除 TaskBreakdown 死碼 |
| `c75a5cc` | AlexanderTseng | AI 推論管線 + 回饋 UI + App Rules |
