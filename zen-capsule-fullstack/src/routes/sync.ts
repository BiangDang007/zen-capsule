// src/routes/sync.ts
//
// Cross-device sync: Chrome extension ↔ mobile app
// MVP uses polling (GET /sync/state). WebSocket upgrade path included as comment.

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const registerDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.enum(['CHROME', 'IOS', 'ANDROID']),
  pushToken: z.string().optional(),
})

export async function syncRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── POST /sync/device ───────────────────────────────
  // Register a device (called on app install / extension load)
  app.post('/sync/device', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = registerDeviceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const device = await prisma.device.create({
      data: { userId, name: body.data.name ?? "Unknown", platform: (body.data.platform ?? "CHROME") as any, pushToken: body.data.pushToken },
    })

    return reply.status(201).send({ device })
  })

  // ── GET /sync/state ─────────────────────────────────
  // Poll this every 10s from mobile to know current focus phase
  app.get('/sync/state', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    // Get active session
    const activeSession = await prisma.focusSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    })

    // Get recent thoughts (for mobile's break-time inbox)
    const recentThoughts = await prisma.thought.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // Today's stats
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todaySessions = await prisma.focusSession.findMany({
      where: { userId, startedAt: { gte: todayStart } },
    })

    const todayMinutes = todaySessions.reduce(
      (acc, s) => acc + (s.durationSeconds ?? 0),
      0
    ) / 60

    const totalInterceptions = todaySessions.reduce(
      (acc, s) => acc + s.interceptCount,
      0
    )

    return reply.send({
      phase: activeSession?.phase ?? 'BREAK',
      // focusState: used by Chrome Extension to show shield status
      focusState: {
        isFocusing: !!activeSession,
        currentGoal: activeSession?.goal ?? null,
        startedAt: activeSession?.startedAt ?? null,
        durationMinutes: activeSession
          ? Math.ceil((Date.now() - activeSession.startedAt.getTime()) / 60000)
          : null,
        todayStats: {
          totalMinutes: Math.round(todayMinutes),
          totalInterceptions,
        },
      },
      activeSession: activeSession
        ? {
            id: activeSession.id,
            goal: activeSession.goal,
            startedAt: activeSession.startedAt,
            durationSeconds: Math.floor(
              (Date.now() - activeSession.startedAt.getTime()) / 1000
            ),
            interceptCount: activeSession.interceptCount,
          }
        : null,
      todayStats: {
        totalMinutes: Math.round(todayMinutes),
        sessionsCount: todaySessions.length,
        totalInterceptions,
      },
      recentThoughts,
    })
  })

  // ── GET /sync/devices ───────────────────────────────
  app.get('/sync/devices', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeen: 'desc' },
    })
    return reply.send({ devices })
  })

  // ── DELETE /sync/device/:id ─────────────────────────
  app.delete('/sync/device/:id', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { id } = req.params as { id: string }

    const device = await prisma.device.findFirst({ where: { id, userId } })
    if (!device) return reply.status(404).send({ error: 'Device not found' })

    await prisma.device.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}

/*
 * ── WebSocket upgrade (post-MVP) ─────────────────────────────────────────────
 *
 * Replace polling with real-time push:
 *
 * import { WebSocket } from 'ws'
 *
 * app.get('/sync/ws', { websocket: true }, (connection, req) => {
 *   const userId = verifyToken(req)
 *   clients.set(userId, connection.socket)
 *
 *   connection.socket.on('close', () => clients.delete(userId))
 * })
 *
 * // When focus state changes:
 * function pushToUser(userId: string, payload: object) {
 *   const ws = clients.get(userId)
 *   if (ws?.readyState === WebSocket.OPEN) {
 *     ws.send(JSON.stringify(payload))
 *   }
 * }
 */
