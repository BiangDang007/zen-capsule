// src/routes/billing.ts
import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { getTodayUsage, getUserLimits } from '../services/usage.service.js'

export async function billingRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── GET /billing/status ─────────────────────────────
  app.get('/billing/status', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    const { plan, limits } = await getUserLimits(userId)
    const usage = await getTodayUsage(userId)

    return reply.send({
      plan,
      planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
      today: {
        analyses: { used: usage.analyses, limit: limits.analyses },
        summaries: { used: usage.summaries, limit: limits.summaries },
      },
      pricing: {
        monthly: 4.99,
        currency: 'USD',
      },
    })
  })
}
