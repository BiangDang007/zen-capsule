# Zen Capsule · 數位結界

專注中自動封鎖社群通知與干擾網站，保護你的深潛時間。

## 專案架構

```
zen-capsule/
├── packages/backend/    # API 伺服器 (Fastify + TypeScript + PostgreSQL)
├── packages/extension/  # Chrome Extension (Manifest V3, TypeScript)
└── packages/desktop/    # Mac 選單列 App (Electron)
```

## 環境需求

- **Node.js** 18+
- **npm** 9+（使用 workspaces）
- **PostgreSQL** 14+

## 快速開始

### 1. Clone 專案

```bash
git clone <repo-url>
cd zen-capsule
npm install
```

### 2. 後端設定

#### 2-1. 設定環境變數

```bash
cp packages/backend/.env.example packages/backend/.env
```

編輯 `packages/backend/.env`：

```env
# 替換成你的 PostgreSQL 連線字串
DATABASE_URL=postgresql://user:password@localhost:5432/zen_capsule

# 隨機產生一個安全的 secret（可用 openssl rand -hex 32）
JWT_SECRET=your-secret-here

# 從 https://console.anthropic.com 取得
ANTHROPIC_API_KEY=sk-ant-your-key-here

# 管理員匯出用的 key（自訂）
EXPORT_KEY=your-export-key-here
```

#### 2-2. 建立資料庫並執行 migration

```bash
# 建立資料庫（若尚未存在）
createdb zen_capsule

# 執行 migration 並產生 Prisma Client
npm run db:migrate
npm run db:generate
```

#### 2-3. 啟動後端

```bash
npm run dev:backend
# 伺服器在 http://localhost:3000 啟動
# 健康檢查：GET http://localhost:3000/health
```

### 3. Chrome Extension 設定

#### 3-1. Build

```bash
npm run build:extension
# 或開發時 watch mode：
npm run dev:extension
```

build 產物會輸出到 `packages/extension/dist/`

#### 3-2. 載入 Chrome

1. 開啟 Chrome，前往 `chrome://extensions`
2. 右上角開啟「開發人員模式」
3. 點選「載入未封裝項目」
4. 選擇 `packages/extension` 資料夾（不是 dist，是整個 extension 資料夾）
5. Extension 圖示出現後，點開 popup 登入即可使用

> Extension 預設連線到 `http://localhost:3000`，請確認後端已啟動。

### 4. Mac Desktop App 設定（Electron）

#### 4-1. 安裝 Electron 相依套件

```bash
cd packages/desktop
npm install
cd ../..
```

#### 4-2. 啟動

```bash
npm run dev:desktop
```

> **注意**：封鎖功能（修改 `/etc/hosts`）需要 sudo 權限。

## 常用指令

```bash
# 後端開發（hot reload）
npm run dev:backend

# Chrome Extension 開發（watch mode）
npm run dev:extension

# Chrome Extension 正式 build
npm run build:extension

# Mac Desktop App 開發
npm run dev:desktop

# Prisma 資料庫 migration
npm run db:migrate

# Prisma Studio（資料庫 GUI）
npm run db:studio
```

## 常見問題

**Q: `prisma migrate dev` 失敗**
確認 `DATABASE_URL` 格式正確，且 PostgreSQL 服務正在運行（`pg_isready`）。

**Q: Chrome Extension 無法連線後端**
確認後端已在 port 3000 啟動（`GET http://localhost:3000/health` 回傳 200）。

**Q: Electron 安裝失敗（ECONNRESET）**
可能是網路問題，試試設定 npm mirror 或使用 VPN 後重試 `npm install`。
