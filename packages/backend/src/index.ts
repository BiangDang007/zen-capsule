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
import { billingRoutes } from './routes/billing.js'
import { prisma } from './lib/prisma.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── ENV validation (fail fast) ────────────────────────
{
  const required = ['JWT_SECRET', 'ANTHROPIC_API_KEY', 'DATABASE_URL']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }
  if (process.env.NODE_ENV === 'production') {
    const placeholders = ['dev-secret-change-me', 'change-me-in-production', 'zen-capsule-super-secret-key-2025']
    if (placeholders.includes(process.env.JWT_SECRET!) || (process.env.JWT_SECRET?.length ?? 0) < 32) {
      console.error('❌ JWT_SECRET must be a strong (>=32 char) non-placeholder value in production')
      process.exit(1)
    }
    if (placeholders.includes(process.env.EXPORT_KEY ?? '')) {
      console.error('❌ EXPORT_KEY must not use a placeholder value in production')
      process.exit(1)
    }
  }
}

const app = Fastify({
  bodyLimit: 1024 * 100, // 100KB
  // Railway terminates TLS at its edge proxy; trust X-Forwarded-For there so
  // req.ip is the real client (rate limits / lockouts break without this).
  trustProxy: process.env.NODE_ENV === 'production',
  logger: {
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

// ── 靜態檔案（前端 HTML）────────────────────────────────
// public/index.html → http://localhost:3001/
await app.register(staticFiles, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
})

// ── Plugins ──────────────────────────────────────────
await app.register(cors, {
  origin: (origin, cb) => {
    if (process.env.NODE_ENV !== 'production') {
      // Dev: allow all origins
      cb(null, true)
      return
    }
    // Production whitelist — mobile apps send no Origin header (allowed by !origin)
    const allowed = ['https://app.zencapsule.com']
    if (!origin || allowed.includes(origin) || /^chrome-extension:\/\//.test(origin)) {
      cb(null, true)
    } else {
      cb(new Error('Not allowed by CORS'), false)
    }
  },
  credentials: true,
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
})

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  // Per-route overrides applied via config.rateLimit in route handlers
  keyGenerator: (req) => (req.user as { sub?: string } | undefined)?.sub ?? req.ip,
})

await app.register(authMiddleware)

// ── Security headers ─────────────────────────────────
app.addHook('onSend', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('X-XSS-Protection', '0')  // modern browsers use CSP instead
  reply.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '))
  if (process.env.NODE_ENV === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})

// ── Routes ────────────────────────────────────────────
await app.register(authRoutes, { prefix: '/api/v1' })
await app.register(focusRoutes, { prefix: '/api/v1' })
await app.register(aiRoutes, { prefix: '/api/v1' })
await app.register(syncRoutes, { prefix: '/api/v1' })
await app.register(billingRoutes, { prefix: '/api/v1' })

// ── Global error handler (hide internals in production) ──
app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500

  // Always log full error server-side
  request.log.error(error)

  if (statusCode >= 500) {
    // Never leak stack traces or internal errors to client
    return reply.status(statusCode).send({
      error: process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : error.message,
      statusCode,
      // Only include stack in dev
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    })
  }

  // 4xx errors — safe to return message
  return reply.status(statusCode).send({
    error: error.message,
    statusCode,
  })
})

// ── Health check ──────────────────────────────────────
app.get('/health', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() }
  } catch {
    return { status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() }
  }
})

// ── Start ──────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3001')

try {
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`\n🧘 Zen Capsule running on http://localhost:${port}\n`)
  console.log(`   前端： http://localhost:${port}/`)
  console.log(`   API：  http://localhost:${port}/api/v1/\n`)

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down gracefully...')
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
