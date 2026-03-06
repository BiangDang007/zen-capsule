// src/routes/auth.ts
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceId: z.string().optional(),
})

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/register ─────────────────────────────
  app.post('/auth/register', async (req, reply) => {
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
  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })

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
