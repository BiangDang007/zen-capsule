// src/routes/ai.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { analyseUrgency, summariseEmails } from '../services/urgency.service.js'
import { checkAndIncrement, LimitExceededError } from '../services/usage.service.js'

const analyseSchema = z.object({
  content: z.string().min(1).max(2000),
  senderName: z.string().max(200).optional(),
  senderContact: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  preview: z.string().max(2000).optional(),
  repeatCount: z.number().int().min(0).max(999).optional(),
  appName: z.string().max(100).optional(),      // "Shopee", "LINE" — from Android
  packageName: z.string().max(200).optional(),  // "com.shopee.tw"  — from Android
})

const feedbackSchema = z.object({
  logId: z.string(),
  userAction: z.enum(['ALLOWED_THROUGH','DISMISSED','OVERRODE_AI','CONFIRMED_BLOCK','MARKED_URGENT','MARKED_NOT_URGENT']),
})

const emailSummarySchema = z.object({
  emails: z.array(z.object({
    from: z.string().max(200),
    subject: z.string().max(500),
    preview: z.string().max(2000).optional().default(''),
  })).max(50),
})

const whitelistSchema = z.object({
  name: z.string().min(1).max(200),
  contact: z.string().min(1).max(500),
  priority: z.number().int().min(1).max(10).default(1),
})

/** Verify the export admin key from Authorization header (not query param!) */
function verifyExportKey(req: any, reply: any): boolean {
  const authHeader = req.headers['x-export-key'] as string | undefined
  if (!authHeader || authHeader !== process.env.EXPORT_KEY) {
    reply.status(403).send({ error: 'Forbidden' })
    return false
  }
  return true
}

function handleUsageError(err: unknown, reply: any) {
  if (err instanceof LimitExceededError) {
    return reply.status(429).send({
      error: 'Daily AI limit reached',
      detail: err.message,
      retryAfter: 'tomorrow',
    })
  }
  throw err
}

export async function aiRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // ── POST /ai/analyse ────────────────────────────────
  // Core urgency check — automatically logs to BehaviorLog
  // Rate: 30/min per user (Android fires on every notification)
  app.post('/ai/analyse', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = analyseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    try {
      await checkAndIncrement(userId, 'analyses')
    } catch (err) {
      return handleUsageError(err, reply)
    }

    const whitelisted = body.data.senderContact
      ? await prisma.whitelist.findFirst({ where: { userId, contact: body.data.senderContact } })
      : null

    const result = await analyseUrgency({
      content: body.data.content,
      senderName: body.data.senderName,
      senderContact: body.data.senderContact,
      isWhitelisted: !!whitelisted,
      repeatCount: body.data.repeatCount ?? 1,
    })

    await prisma.focusSession.updateMany({
      where: { userId, endedAt: null },
      data: { interceptCount: { increment: 1 } },
    })

    // ── Auto log every judgement as training data ─────
    const activeSession = await prisma.focusSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    })
    const now = new Date()

    const log = await prisma.behaviorLog.create({
      data: {
        userId,
        senderEmail: body.data.senderContact,
        senderName: body.data.senderName,
        subject: body.data.subject || body.data.content.slice(0, 100),
        preview: body.data.preview || body.data.content.slice(0, 200),
        appName: body.data.appName,
        packageName: body.data.packageName,
        isWhitelisted: !!whitelisted,
        repeatCount: body.data.repeatCount ?? 1,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
        aiScore: result.score,
        aiCategory: result.category as any,
        aiShouldBreak: result.shouldBreakthrough,
        aiReason: result.reason,
        modelVersion: 'claude-haiku-4-5',
        focusSessionId: activeSession?.id,
        focusMinute: activeSession
          ? Math.floor((now.getTime() - activeSession.startedAt.getTime()) / 60000)
          : null,
      },
    })

    return reply.send({ result, logId: log.id })
  })

  // ── POST /ai/feedback ───────────────────────────────
  // User confirms/overrides AI decision → updates ground truth label
  app.post('/ai/feedback', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = feedbackSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const log = await prisma.behaviorLog.findFirst({ where: { id: body.data.logId, userId } })
    if (!log) return reply.status(404).send({ error: 'Log not found' })

    await prisma.behaviorLog.update({
      where: { id: body.data.logId },
      data: {
        userAction: body.data.userAction as any,
        userActionAt: new Date(),
      },
    })

    return reply.send({ ok: true })
  })

  // ── GET /ai/export ──────────────────────────────────
  // Export labelled training data as JSON
  // Only returns logs where userAction is recorded (ground truth exists)
  app.get('/ai/export', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    // Admin key via header (never in URL/query params for security)
    if (!verifyExportKey(req, reply)) return

    const query = req.query as { limit?: string }
    const exportLimit = Math.min(Math.max(parseInt(query.limit ?? '5000') || 5000, 1), 10000) // cap at 10k rows

    const logs = await prisma.behaviorLog.findMany({
      where: {
        userId,
        userAction: { not: null }, // only labelled data
      },
      take: exportLimit,
      select: {
        // Input features
        senderEmail: true,
        senderName: true,
        subject: true,
        preview: true,
        isWhitelisted: true,
        repeatCount: true,
        hourOfDay: true,
        dayOfWeek: true,
        // AI decision
        aiScore: true,
        aiCategory: true,
        aiShouldBreak: true,
        // Ground truth label (what the user actually did)
        userAction: true,
        // Metadata
        createdAt: true,
        focusMinute: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Convert to training-ready format
    const trainingData = logs.map(l => ({
      // Features (X)
      input: {
        subject: l.subject,
        preview: l.preview,
        senderName: l.senderName,
        isWhitelisted: l.isWhitelisted,
        repeatCount: l.repeatCount,
        hourOfDay: l.hourOfDay,
        dayOfWeek: l.dayOfWeek,
      },
      // AI prediction
      aiPrediction: {
        score: l.aiScore,
        category: l.aiCategory,
        shouldBreak: l.aiShouldBreak,
      },
      // Ground truth label (Y) — what the user actually wanted
      label: {
        userAction: l.userAction,
        // Derived binary label: was this truly urgent?
        isUrgent: ['ALLOWED_THROUGH','MARKED_URGENT','OVERRODE_AI'].includes(l.userAction!),
        // Did AI get it right?
        aiWasCorrect:
          l.aiShouldBreak === ['ALLOWED_THROUGH','MARKED_URGENT'].includes(l.userAction!),
      },
      meta: {
        createdAt: l.createdAt,
        focusMinute: l.focusMinute,
      }
    }))

    const stats = {
      total: trainingData.length,
      urgent: trainingData.filter(d => d.label.isUrgent).length,
      notUrgent: trainingData.filter(d => !d.label.isUrgent).length,
      aiAccuracy: trainingData.length > 0
        ? (trainingData.filter(d => d.label.aiWasCorrect).length / trainingData.length * 100).toFixed(1) + '%'
        : 'N/A',
    }

    return reply.send({ stats, data: trainingData })
  })

  // ── GET /ai/export/csv ──────────────────────────────
  // CSV format for Excel / pandas
  app.get('/ai/export/csv', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    // Admin key via header (never in URL/query params for security)
    if (!verifyExportKey(req, reply)) return

    const logs = await prisma.behaviorLog.findMany({
      where: { userId, userAction: { not: null } },
      orderBy: { createdAt: 'desc' },
    })

    // CSV injection defence: prefix cells starting with =, +, -, @, \t, \r with a single quote
    const csvSafe = (val: string): string => {
      const escaped = val.replace(/"/g, '""')
      if (/^[=+\-@\t\r]/.test(escaped)) return `"'${escaped}"`
      return `"${escaped}"`
    }

    const header = 'subject,preview,senderName,isWhitelisted,repeatCount,hourOfDay,dayOfWeek,aiScore,aiCategory,aiShouldBreak,userAction,isUrgent,aiWasCorrect,createdAt'
    const rows = logs.map(l => {
      const isUrgent = ['ALLOWED_THROUGH','MARKED_URGENT','OVERRODE_AI'].includes(l.userAction!)
      const aiWasCorrect = l.aiShouldBreak === ['ALLOWED_THROUGH','MARKED_URGENT'].includes(l.userAction!)
      return [
        csvSafe(l.subject),
        csvSafe(l.preview.slice(0, 100)),
        csvSafe(l.senderName || ''),
        l.isWhitelisted,
        l.repeatCount,
        l.hourOfDay,
        l.dayOfWeek,
        l.aiScore,
        l.aiCategory,
        l.aiShouldBreak,
        l.userAction,
        isUrgent,
        aiWasCorrect,
        l.createdAt.toISOString()
      ].join(',')
    })

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', 'attachment; filename="zen_training_data.csv"')
    return reply.send([header, ...rows].join('\n'))
  })

  // ── POST /ai/summarise-emails ───────────────────────
  // Rate: 5/min per user (Sonnet is expensive)
  app.post('/ai/summarise-emails', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = emailSummarySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    try {
      await checkAndIncrement(userId, 'summaries')
    } catch (err) {
      return handleUsageError(err, reply)
    }

    const summary = await summariseEmails(body.data.emails.map(e => ({ from: e.from, subject: e.subject, preview: e.preview })))
    return reply.send({ summary })
  })

  // ── Whitelist CRUD ──────────────────────────────────
  app.get('/ai/whitelist', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    return reply.send({ whitelist: await prisma.whitelist.findMany({ where: { userId }, orderBy: { priority: 'desc' } }) })
  })

  app.post('/ai/whitelist', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = whitelistSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const entry = await prisma.whitelist.create({ data: { userId, name: body.data.name, contact: body.data.contact, priority: body.data.priority ?? 1 } })
    return reply.status(201).send({ entry })
  })

  app.delete('/ai/whitelist/:id', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { id } = req.params as { id: string }
    const entry = await prisma.whitelist.findFirst({ where: { id, userId } })
    if (!entry) return reply.status(404).send({ error: 'Not found' })
    await prisma.whitelist.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}