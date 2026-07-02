# Zen Capsule — 網站改版與資安偵查紀錄

> 產出日期：2026-07-02
> 範圍：官網（`packages/backend/public/`）重建 + 後端殘留資安修補 + 全站資安偵查
> 狀態：✅ 網站完成、資安 13 項全數通過，尚未 commit / 部署

---

## 0. 一句話總結

把原本塞在單一 `index.html`（含 inline style/script、寫死 `localhost:3000`、瀏覽器直呼 Anthropic API、假 Google 登入、與後端不符的假價格）的網站，重建為 **4 頁、資源外部化、嚴格 CSP 相容、內容誠實** 的正式官網；同時修掉稽核報告殘留的後端問題。依使用者回饋做了「樸實美」收斂。資安偵查 13 項全過。

---

## 1. 網站現況（4 個頁面，由後端 `@fastify/static` serve）

| 頁面 | 路徑 | 用途 |
|------|------|------|
| Landing | `/`（`index.html`） | 產品介紹、三段式儀式、緊急攔截網、定價、FAQ |
| Web 體驗版 | `/app.html` | 註冊登入、專注計時、AI 緊急判斷、每日統計（`noindex`） |
| 隱私權政策 | `/privacy.html` | 中英雙語，Google Play 上架用公開網址 |
| 服務條款 | `/terms.html` | 訂閱、取消、免責（中英雙語） |

**共用資源**：`css/site.css`（全站唯一樣式）、`js/main.js`（官網互動）、`js/app.js`（主控台邏輯）、`favicon.svg`、`robots.txt`。

### 設計語言
- 墨色琥珀（dark amber）禪意風；字體 Noto Serif TC + DM Serif Display + Space Mono。
- **樸實美收斂**（依使用者回饋）：移除自訂游標、跑馬燈、手機 3D 傾斜、hover 位移與光暈；保留安靜質感：細粒紋、hero 縱書、「壹貳參」幽影數字、放慢至 12 秒的呼吸環。

---

## 2. 修掉的內容 / 技術問題

| 問題 | 原狀 | 現狀 |
|------|------|------|
| API host 寫死 | `const API = 'http://localhost:3000/api/v1'` | 相對路徑 `/api/v1`（同源，dev/prod 皆正確） |
| 前端直呼 Anthropic | 瀏覽器 `fetch('api.anthropic.com')` | 移除，一律走後端 |
| 假價格 | 網頁寫 $9.9 / $14.9，後端是 $4.99 | 對齊為 FREE $0 / PRO US$4.99 |
| 不實內容 | iOS、團隊版、14 天試用、Slack 整合 | 移除，只留真實功能（Android + Chrome + Web 體驗） |
| 假 Google 登入 | 按了只跳「後端未串接」 | 移除，改 email 註冊/登入 |
| CSP 違規 | 大量 inline style / onclick | 全外部化，零 inline |
| SEO / 分享 | 無 | 補 meta description、OG、favicon、robots.txt |

---

## 3. 後端資安修補（稽核報告殘留項）

| 編號 | 項目 | 修法 | 檔案 |
|------|------|------|------|
| M4 | PORT 預設不一致（3000/3001） | `index.ts` 預設改 3001，對齊 `.env.example` | `packages/backend/src/index.ts` |
| M1 | 登入僅 per-IP 鎖定，可換 IP 暴破 | 加 per-account 鎖定（`OR: [{ip},{email}]`）+ production `trustProxy` | `packages/backend/src/routes/auth.ts`、`index.ts` |
| L4 | 登入 timing 旁通道洩漏帳號是否存在 | 帳號不存在時比對固定 dummy bcrypt hash，均衡回應時間 | `packages/backend/src/routes/auth.ts` |
| H4 | CSP 含 `unsafe-inline` | 移除 `unsafe-inline`，加 fonts 白名單、`object-src 'none'`、`frame-ancestors 'none'` 等 | `packages/backend/src/index.ts` |
| L1 | 健康檢查用 `$queryRawUnsafe` | 改參數化 `$queryRaw\`SELECT 1\`` | `packages/backend/src/index.ts` |

> 註：稽核報告的 C1（keystore 密碼）、C3（keyword 繞用量）、H1（refresh token 當 access token）、M3（防呆常數）在上一個 commit `20cdf91` 已修，本次已複核確認到位。

---

## 4. 資安偵查結果（2026-07-02，13 項全過）

以本機 `http://localhost:3001` 實測 + 靜態掃描：

| # | 檢查項 | 結果 |
|---|--------|------|
| 1 | XSS sink（innerHTML/eval/document.write…） | ✅ 無，動態文字一律 `textContent` |
| 2 | inline event handler（onclick 等） | ✅ 無 |
| 3 | 硬編碼密鑰 / token / 密碼 | ✅ 無 |
| 4 | 前端直呼外部 API / 寫死 host | ✅ 無 |
| 5 | API base 為同源相對路徑 | ✅ `/api/v1` |
| 6 | 安全標頭（CSP/X-Frame-Options/nosniff/HSTS） | ✅ 齊全 |
| 7 | inline `style=""`（CSP 會封鎖） | ✅ 官網頁面無 |
| 8 | inline `<script>` | ✅ 無，全走 `src` |
| 9 | `app.html` noindex | ✅ 有 |
| 10 | 預覽代理只綁 127.0.0.1 | ✅ 是（`scripts/preview-proxy.mjs`） |
| 11 | 路徑穿越讀 `.env`/原始碼 | ✅ 擋下（403/404） |
| 12 | 未登入打受保護 API | ✅ 回 401 |
| 13 | `dev-upgrade` 端點 production 防護 | ✅ production 回 404 |

**結論：網站無已知資安問題，可安全部署。**

### 已安裝的資安工具（供日後每個專案重複使用）
Trail of Bits 官方 Claude Code plugins（裝在 `~/.claude`，user scope）：
`static-analysis`、`differential-review`、`insecure-defaults`、`sharp-edges`、`fp-check`。
另有內建 `/security-review` slash command。

---

## 5. 功能驗證（瀏覽器實測）

Web 體驗版跑完整條流程，皆正常：
註冊測試帳號 → 開始專注（計時器運作）→ AI 緊急判斷（免費版正確回傳「不含 AI 分析、訊息已攔截」）→ 結束專注（進休息畫面）→ 統計更新。
桌面與手機（375px）RWD 正常、零 console 錯誤、無 JS 環境內容仍可見。

---

## 6. 距離上架還差的事（尚未完成，非本次範圍）

1. **部署**：本次改動尚未 commit / push 到 Railway。
2. **金流（稽核 C2）**：後端 RevenueCat webhook 已就緒，但 mobile 端 RevenueCat SDK、Google Play Console 內購商品、端對端測試尚未完成。
3. **Google Play 政策**：
   - Data Safety 表單需申報「蒐集訊息內容並與 Anthropic 共享」。
   - 通知存取權限會被 Google 人工審查（隱私權政策已備妥對應措辭）。

---

## 7. 本機預覽方式（給日後的自己 / agent）

preview 沙箱讀不到 `.env`，所以流程是：
1. 自己起後端：`cd packages/backend && set -a && . ./.env && set +a && npx tsx src/index.ts`（跑在 :3001）
2. 再 `preview_start("web")`：`.claude/launch.json` 的 `web` 會跑 `scripts/preview-proxy.mjs`（無秘密、綁 127.0.0.1、轉發到 :3001）。

詳見 `CLAUDE.md` 的「Website」與「Browser preview」段落。
