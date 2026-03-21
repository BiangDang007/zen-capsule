// src/routes/auth.ts
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().max(128),
  deviceId: z.string().max(200).optional(),
})

// ── DB-backed login attempt tracker (per-IP) ──────────────────────
const MAX_LOGIN_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

async function checkLockout(ip: string): Promise<{ locked: boolean; retryAfterSec?: number }> {
  const windowStart = new Date(Date.now() - LOCKOUT_DURATION_MS)
  const recentFails = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gte: windowStart } },
  })
  if (recentFails >= MAX_LOGIN_ATTEMPTS) {
    const oldest = await prisma.loginAttempt.findFirst({
      where: { ip, success: false, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'asc' },
    })
    const unlockAt = oldest ? oldest.createdAt.getTime() + LOCKOUT_DURATION_MS : Date.now() + LOCKOUT_DURATION_MS
    return { locked: true, retryAfterSec: Math.ceil((unlockAt - Date.now()) / 1000) }
  }
  return { locked: false }
}

async function recordAttempt(ip: string, email: string, success: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { ip, email, success } })
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/register ─────────────────────────────
  app.post('/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const exists = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (exists) return reply.status(409).send({ error: 'Email already registered' })

    const passwordHash = await bcrypt.hash(body.data.password, 12)

    const user = await prisma.user.create({
      data: {
        email: body.data.email,
        passwordHash,
        profile: { create: {} }, // default profile
      },
      select: { id: true, email: true, createdAt: true },
    })

    const { accessToken, refreshToken } = await issueTokens(app, user.id)
    return reply.status(201).send({ user, accessToken, refreshToken })
  })

  // ── POST /auth/login ────────────────────────────────
  app.post('/auth/login', {
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Check IP-based lockout
    const ip = req.ip
    const lockout = await checkLockout(ip)
    if (lockout.locked) {
      return reply.status(429).send({
        error: `Too many login attempts. Try again in ${lockout.retryAfterSec} seconds.`,
      })
    }

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) {
      await recordAttempt(ip, body.data.email, false)
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) {
      await recordAttempt(ip, body.data.email, false)
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    // Login success — record successful attempt
    await recordAttempt(ip, body.data.email, true)

    const { accessToken, refreshToken } = await issueTokens(app, user.id, body.data.deviceId)

    // Fire-and-forget cleanup (don't block the response)
    cleanupExpiredSessions().catch(() => {})

    return reply.send({
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    })
  })

  // ── POST /auth/refresh ──────────────────────────────
  app.post('/auth/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string }
    if (!refreshToken) return reply.status(400).send({ error: 'refreshToken required' })

    const session = await prisma.session.findUnique({ where: { refreshToken } })
    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' })
    }

    // Rotate refresh token
    await prisma.session.delete({ where: { id: session.id } })
    const tokens = await issueTokens(app, session.userId, session.deviceId ?? undefined)
    return reply.send(tokens)
  })

  // ── POST /auth/logout ───────────────────────────────
  app.post('/auth/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string }
    if (refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken } })
    }
    return reply.send({ ok: true })
  })

  // ── Periodic cleanup: expired sessions ──────────────
  // Clean up on each login (lightweight, avoids needing a cron job)
  async function cleanupExpiredSessions() {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    // Also clean old login attempts (> 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } })
  }
}

// ── Helpers ─────────────────────────────────────────────
async function issueTokens(app: FastifyInstance, userId: string, deviceId?: string) {
  const accessToken = app.jwt.sign(
    { sub: userId },
    { expiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m' }
  )
  const refreshToken = app.jwt.sign(
    { sub: userId, type: 'refresh' },
    { expiresIn: process.env.JWT_REFRESH_EXPIRES ?? '30d' }
  )

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await prisma.session.create({
    data: { userId, refreshToken, deviceId, expiresAt },
  })

  return { accessToken, refreshToken }
}
