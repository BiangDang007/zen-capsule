// src/routes/sync.ts
//
// Cross-device sync: Chrome extension ↔ mobile app
// MVP uses polling (GET /sync/state). WebSocket upgrade path included as comment.

import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function syncRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── GET /sync/state ─────────────────────────────────
  // Poll this every 10s from mobile to know current focus phase
  app.get('/sync/state', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    // Get active session
    const activeSession = await prisma.focusSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
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
    })
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
