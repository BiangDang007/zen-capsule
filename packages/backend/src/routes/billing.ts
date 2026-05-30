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

  // ── POST /billing/webhook/revenuecat ────────────────
  // RevenueCat calls this on purchase/renewal/expiration. Configure the same
  // secret as the "Authorization header value" in the RevenueCat dashboard, and
  // set the SDK's appUserID to OUR user id so event.app_user_id maps back.
  app.post('/billing/webhook/revenuecat', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET
    if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const event = (req.body as any)?.event
    const userId: string | undefined = event?.app_user_id
    const type: string = event?.type ?? ''
    if (!userId) return reply.status(400).send({ error: 'Missing app_user_id' })

    // Ignore events for users we don't know (e.g. anonymous RC ids)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return reply.send({ ok: true, note: 'unknown user ignored' })

    const GRANT = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE']
    const REVOKE = ['EXPIRATION', 'REFUND', 'SUBSCRIPTION_PAUSED']

    if (GRANT.includes(type)) {
      const expires = event.expiration_at_ms
        ? new Date(Number(event.expiration_at_ms))
        : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
      await prisma.user.update({ where: { id: userId }, data: { plan: 'PRO', planExpiresAt: expires } })
      req.log.info({ userId, action: 'PLAN_UPGRADE', type }, 'RevenueCat grant')
    } else if (REVOKE.includes(type)) {
      await prisma.user.update({ where: { id: userId }, data: { plan: 'FREE', planExpiresAt: null } })
      req.log.info({ userId, action: 'PLAN_DOWNGRADE', type }, 'RevenueCat revoke')
    }

    return reply.send({ ok: true })
  })

  // ── POST /billing/dev-upgrade (DEV ONLY) ────────────
  // Convenience endpoint to flip the caller to PRO for 30 days while testing on
  // the emulator. Disabled in production — real upgrades come via the webhook.
  app.post('/billing/dev-upgrade', auth, async (req, reply) => {
    if (process.env.NODE_ENV === 'production') return reply.status(404).send({ error: 'Not found' })
    const userId = (req.user as { sub: string }).sub
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await prisma.user.update({ where: { id: userId }, data: { plan: 'PRO', planExpiresAt: expires } })
    req.log.info({ userId, action: 'PLAN_UPGRADE', type: 'DEV' }, 'Dev upgrade to PRO')
    return reply.send({ ok: true, plan: 'PRO', planExpiresAt: expires.toISOString() })
  })
}
