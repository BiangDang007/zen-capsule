// src/routes/focus.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const startSchema = z.object({
  goal: z.string().min(1).max(200),
})

const endSchema = z.object({
  sessionId: z.string(),
})

const thoughtSchema = z.object({
  content: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
})

export async function focusRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── POST /focus/start ───────────────────────────────
  // Begins a focus session, broadcasts to all devices via sync
  app.post('/focus/start', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = startSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Close any open session first
    await prisma.focusSession.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date(), phase: 'BREAK' },
    })

    const session = await prisma.focusSession.create({
      data: { userId, goal: body.data.goal, phase: 'FOCUS' },
    })

    // Update sync state for all devices
    await broadcastSyncState(userId, 'FOCUS', session.id)

    return reply.status(201).send({ session })
  })

  // ── POST /focus/end ─────────────────────────────────
  app.post('/focus/end', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = endSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const session = await prisma.focusSession.findFirst({
      where: { id: body.data.sessionId, userId, endedAt: null },
    })
    if (!session) return reply.status(404).send({ error: 'Session not found' })

    const endedAt = new Date()
    const durationSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000)

    const updated = await prisma.focusSession.update({
      where: { id: session.id },
      data: { endedAt, durationSeconds, phase: 'BREAK' },
    })

    await broadcastSyncState(userId, 'BREAK', session.id)

    return reply.send({ session: updated })
  })

  // ── GET /focus/history ──────────────────────────────
  app.get('/focus/history', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { limit = '10', offset = '0' } = req.query as Record<string, string>

    // Clamp pagination to prevent DoS via huge queries
    const take = Math.min(Math.max(parseInt(limit) || 10, 1), 100)    // 1–100
    const skip = Math.max(parseInt(offset) || 0, 0)                   // >= 0

    const sessions = await prisma.focusSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take,
      skip,
    })

    const total = await prisma.focusSession.count({ where: { userId } })
    const totalMinutes = sessions.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0) / 60

    return reply.send({ sessions, total, totalMinutes: Math.round(totalMinutes) })
  })

  // ── POST /focus/thought ─────────────────────────────
  // Alt+S quick capture
  app.post('/focus/thought', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = thoughtSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const thought = await prisma.thought.create({
      data: { userId, content: body.data.content, sessionId: body.data.sessionId },
    })

    return reply.status(201).send({ thought })
  })

  // ── GET /focus/session-report ───────────────────────
  // Break-time summary: all intercepted notifications grouped by AI category
  app.get('/focus/session-report', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { sessionId } = req.query as { sessionId?: string }

    const session = sessionId
      ? await prisma.focusSession.findFirst({ where: { id: sessionId, userId } })
      : await prisma.focusSession.findFirst({
          where: { userId, endedAt: { not: null } },
          orderBy: { endedAt: 'desc' },
        })

    if (!session) return reply.status(404).send({ error: 'No session found' })

    const logs = await prisma.behaviorLog.findMany({
      where: { userId, focusSessionId: session.id },
      select: {
        id: true, appName: true, packageName: true,
        senderName: true, subject: true, preview: true,
        aiCategory: true, aiScore: true, aiShouldBreak: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const byCategory = (cat: string) =>
      logs.filter(l => l.aiCategory === cat).map(l => ({
        ...l, createdAt: l.createdAt.toISOString(),
      }))

    const adsLogs = logs.filter(l => l.aiCategory === 'ads')
    const appCounts: Record<string, number> = {}
    for (const l of adsLogs) {
      const name = l.appName ?? l.packageName ?? 'Unknown'
      appCounts[name] = (appCounts[name] ?? 0) + 1
    }
    const topApps = Object.entries(appCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} x${count}`)

    return reply.send({
      sessionId: session.id,
      sessionGoal: session.goal,
      startedAt: session.startedAt.toISOString(),
      durationMinutes: session.durationSeconds ? Math.round(session.durationSeconds / 60) : 0,
      totalIntercepted: logs.length,
      critical: byCategory('critical'),
      important: byCategory('important'),
      normal: byCategory('normal'),
      social: byCategory('social'),
      ads: { count: adsLogs.length, topApps },
    })
  })

  // ── GET /focus/thoughts ─────────────────────────────
  app.get('/focus/thoughts', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const thoughts = await prisma.thought.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return reply.send({ thoughts })
  })
}

// Upsert a simple sync state record (reuses Device table's lastSeen)
async function broadcastSyncState(userId: string, phase: string, sessionId: string) {
  // In production: push to Redis pub/sub or WebSocket channel
  // For MVP: devices poll GET /sync/state
  await prisma.focusSession.update({
    where: { id: sessionId },
    data: { phase: phase as 'FOCUS' | 'BREAK' | 'RITUAL' },
  })
}
