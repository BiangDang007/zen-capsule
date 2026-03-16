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

// ── In-memory login attempt tracker (per-IP) ──────────────────────
// In production, this should be Redis-backed for multi-instance deployments.
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()
const MAX_LOGIN_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

function checkLockout(ip: string): { locked: boolean; retryAfterSec?: number } {
  const record = loginAttempts.get(ip)
  if (!record) return { locked: false }

  const elapsed = Date.now() - record.lastAttempt
  if (record.count >= MAX_LOGIN_ATTEMPTS && elapsed < LOCKOUT_DURATION_MS) {
    return { locked: true, retryAfterSec: Math.ceil((LOCKOUT_DURATION_MS - elapsed) / 1000) }
  }

  // Reset after lockout window
  if (elapsed >= LOCKOUT_DURATION_MS) {
    loginAttempts.delete(ip)
    return { locked: false }
  }

  return { locked: false }
}

function recordFailedAttempt(ip: string): void {
  const record = loginAttempts.get(ip)
  if (record) {
    record.count += 1
    record.lastAttempt = Date.now()
  } else {
    loginAttempts.set(ip, { count: 1, lastAttempt: Date.now() })
  }
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip)
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
    const lockout = checkLockout(ip)
    if (lockout.locked) {
      return reply.status(429).send({
        error: `Too many login attempts. Try again in ${lockout.retryAfterSec} seconds.`,
      })
    }

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) {
      recordFailedAttempt(ip)
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) {
      recordFailedAttempt(ip)
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    // Login success — clear attempts
    clearAttempts(ip)

    const { accessToken, refreshToken } = await issueTokens(app, user.id, body.data.deviceId)
    return reply.send({
      user: { id: user.id, email: user.email },
      accessToken,
      refreshToken,
    })
  })

  // ── POST /auth/refresh ──────────────────────────────
  app.post('/auth/refresh', async (req, reply) => {
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
