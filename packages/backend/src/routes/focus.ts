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

export async function focusRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── POST /focus/start ───────────────────────────────
  // Begins a focus session, broadcasts to all devices via sync
  app.post('/focus/start', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = startSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Close any open session first (calculate duration to avoid stats being 0)
    const session = await prisma.$transaction(async (tx) => {
      const now = new Date()
      const openSessions = await tx.focusSession.findMany({
        where: { userId, endedAt: null },
      })
      for (const s of openSessions) {
        const dur = Math.floor((now.getTime() - s.startedAt.getTime()) / 1000)
        await tx.focusSession.update({
          where: { id: s.id },
          data: { endedAt: now, phase: 'BREAK', durationSeconds: dur },
        })
      }
      return tx.focusSession.create({
        data: { userId, goal: body.data.goal, phase: 'FOCUS' },
      })
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

    // Auto-close ALL orphaned sessions (endedAt is null).
    // These occur when the app is force-closed mid-focus.
    const orphaned = await prisma.focusSession.findMany({
      where: { userId, endedAt: null },
    })
    if (orphaned.length > 0) {
      const now = new Date()
      await Promise.all(orphaned.map(s =>
        prisma.focusSession.update({
          where: { id: s.id },
          data: {
            endedAt: now,
            phase: 'BREAK',
            durationSeconds: Math.floor((now.getTime() - s.startedAt.getTime()) / 1000),
          },
        })
      ))
    }

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

  // ── GET /focus/session-report ───────────────────────
  // Break-time summary: all intercepted notifications grouped by AI category
  app.get('/focus/session-report', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { sessionId } = req.query as { sessionId?: string }

    let session = sessionId
      ? await prisma.focusSession.findFirst({ where: { id: sessionId, userId } })
      : await prisma.focusSession.findFirst({
          where: { userId, endedAt: { not: null } },
          orderBy: { endedAt: 'desc' },
        })

    // Auto-recover orphaned sessions: if no ended session found,
    // check for stale in-progress sessions and close them
    if (!session && !sessionId) {
      const orphaned = await prisma.focusSession.findFirst({
        where: { userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      })
      if (orphaned) {
        const now = new Date()
        const dur = Math.floor((now.getTime() - orphaned.startedAt.getTime()) / 1000)
        session = await prisma.focusSession.update({
          where: { id: orphaned.id },
          data: { endedAt: now, phase: 'BREAK', durationSeconds: dur },
        })
      }
    }

    if (!session) return reply.status(404).send({ error: 'No session found' })

    const logs = await prisma.behaviorLog.findMany({
      where: {
        userId,
        // Include logs explicitly linked to session, plus any unlinked logs
        // created during the session window (covers race condition where
        // notifications arrived before /focus/start API returned)
        OR: [
          { focusSessionId: session.id },
          {
            focusSessionId: null,
            createdAt: {
              gte: session.startedAt,
              lte: session.endedAt ?? new Date(),
            },
          },
        ],
      },
      select: {
        id: true, appName: true, packageName: true,
        senderName: true, subject: true, preview: true,
        aiCategory: true, aiScore: true, aiShouldBreak: true,
        aiReason: true, userAction: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const byCategory = (cat: string) =>
      logs.filter(l => l.aiCategory === cat).map(l => ({
        ...l,
        logId: l.id,      // expose for feedback API
        createdAt: l.createdAt.toISOString(),
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
