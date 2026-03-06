// src/index.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import staticFiles from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { authMiddleware } from './middleware/auth.js'
import { authRoutes } from './routes/auth.js'
import { focusRoutes } from './routes/focus.js'
import { aiRoutes } from './routes/ai.js'
import { syncRoutes } from './routes/sync.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

// ── 靜態檔案（前端 HTML）────────────────────────────────
// public/index.html → http://localhost:3000/
await app.register(staticFiles, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
})

// ── Plugins ──────────────────────────────────────────
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://app.zencapsule.com', 'chrome-extension://*']
    : true,
  credentials: true,
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
})

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

await app.register(authMiddleware)

// ── Routes ────────────────────────────────────────────
await app.register(authRoutes, { prefix: '/api/v1' })
await app.register(focusRoutes, { prefix: '/api/v1' })
await app.register(aiRoutes, { prefix: '/api/v1' })
await app.register(syncRoutes, { prefix: '/api/v1' })

// ── Health check ──────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  version: '0.1.0',
  timestamp: new Date().toISOString(),
}))

// ── Start ──────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000')

try {
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`\n🧘 Zen Capsule running on http://localhost:${port}\n`)
  console.log(`   前端： http://localhost:${port}/`)
  console.log(`   API：  http://localhost:${port}/api/v1/\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
