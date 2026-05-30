// src/routes/ai.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { analyseUrgency, analyseUrgencyBatch, summariseEmails } from '../services/urgency.service.js'
import { checkAndIncrement, LimitExceededError, getEffectivePlan } from '../services/usage.service.js'

const analyseSchema = z.object({
  content: z.string().min(1).max(2000),
  senderName: z.string().max(200).optional(),
  senderContact: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  preview: z.string().max(2000).optional(),
  repeatCount: z.number().int().min(0).max(999).optional(),
  appName: z.string().max(100).optional(),      // "Shopee", "LINE" — from Android
  packageName: z.string().max(200).optional(),  // "com.shopee.tw"  — from Android
  // When set, skip Claude AI and record directly (keyword match on client)
  keywordScore: z.number().int().min(0).max(100).optional(),
  keywordReason: z.string().max(200).optional(),
})

const batchAnalyseSchema = z.object({
  items: z.array(z.object({
    content: z.string().min(1).max(2000),
    senderName: z.string().max(200).optional(),
    senderContact: z.string().max(500).optional(),
    subject: z.string().max(500).optional(),
    preview: z.string().max(2000).optional(),
    appName: z.string().max(100).optional(),
    packageName: z.string().max(200).optional(),
    repeatCount: z.number().int().min(0).max(999).optional(),
  })).min(1).max(50),
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
  relationship: z.enum(['boss', 'client', 'family', 'friend', 'coworker', 'other']).default('other'),
  priority: z.number().int().min(1).max(10).default(1),
})

const appRuleSchema = z.object({
  appName: z.string().min(1).max(100),
  packageName: z.string().max(200).optional(),
  action: z.enum(['always_block', 'always_allow', 'ask_ai']),
})

// Server-side urgent keyword list (mirrors the Android client list). Used to
// re-validate the client keyword fast-path so a client cannot fake urgency by
// sending an arbitrary keywordScore.
const SERVER_URGENT_KEYWORDS = [
  '急', '緊急', '掛掉', '壞掉', '立刻', '馬上',
  '失火', '火災', '修', '趕快', '出問題', '異常',
  'crash', 'down', 'urgent', 'asap', 'emergency',
  'critical', 'outage', 'incident',
]
function matchUrgentKeyword(text: string): string | null {
  const lower = text.toLowerCase()
  for (const kw of SERVER_URGENT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return kw
  }
  return null
}

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

    // ── Check app-level rules first (saves API calls) ──
    if (body.data.appName) {
      const appRule = await prisma.appRule.findUnique({
        where: { userId_appName: { userId, appName: body.data.appName } },
      })
      if (appRule?.action === 'always_block') {
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
            isWhitelisted: false,
            repeatCount: body.data.repeatCount ?? 1,
            hourOfDay: now.getHours(),
            dayOfWeek: now.getDay(),
            aiScore: 0,
            aiCategory: 'ads',
            aiShouldBreak: false,
            aiReason: 'App-level block rule',
            modelVersion: 'local-rule',
          },
        })
        return reply.send({
          result: { score: 0, isUrgent: false, shouldBreakthrough: false, reason: 'App 已被封鎖', category: 'ads' as const },
          logId: log.id,
        })
      }
      if (appRule?.action === 'always_allow') {
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
            isWhitelisted: true,
            repeatCount: body.data.repeatCount ?? 1,
            hourOfDay: now.getHours(),
            dayOfWeek: now.getDay(),
            aiScore: 100,
            aiCategory: 'critical',
            aiShouldBreak: true,
            aiReason: 'App-level allow rule',
            modelVersion: 'local-rule',
          },
        })
        return reply.send({
          result: { score: 100, isUrgent: true, shouldBreakthrough: true, reason: 'App 已設為允許通過', category: 'critical' as const },
          logId: log.id,
        })
      }
    }

    // ── Keyword fast-path ──────────────────────────────────────────────
    // The client may flag an obvious urgent keyword to skip a Claude call, but we
    // NEVER trust the client-supplied score: re-validate against a server-side
    // keyword list and use a fixed server score. If no real keyword is present,
    // fall through to full AI analysis (which consumes quota).
    const serverKeyword = body.data.keywordScore != null
      ? matchUrgentKeyword(`${body.data.subject ?? ''} ${body.data.content} ${body.data.preview ?? ''}`)
      : null
    if (serverKeyword) {
      const now = new Date()
      const score = 90              // server-fixed; client score is not trusted
      const shouldBreak = true      // verified urgent keyword → breakthrough
      const category = 'critical' as const
      const reason = `Keyword match: ${serverKeyword}`

      const log = await prisma.$transaction(async (tx) => {
        await tx.focusSession.updateMany({
          where: { userId, endedAt: null },
          data: { interceptCount: { increment: 1 } },
        })
        const activeSession = await tx.focusSession.findFirst({
          where: { userId, endedAt: null },
          orderBy: { startedAt: 'desc' },
        })
        return tx.behaviorLog.create({
          data: {
            userId,
            senderEmail: body.data.senderContact,
            senderName: body.data.senderName,
            subject: body.data.subject || body.data.content.slice(0, 100),
            preview: body.data.preview || body.data.content.slice(0, 200),
            appName: body.data.appName,
            packageName: body.data.packageName,
            isWhitelisted: false,
            repeatCount: body.data.repeatCount ?? 1,
            hourOfDay: now.getHours(),
            dayOfWeek: now.getDay(),
            aiScore: score,
            aiCategory: category,
            aiShouldBreak: shouldBreak,
            aiReason: reason,
            modelVersion: 'local-keyword',
            focusSessionId: activeSession?.id,
            focusMinute: activeSession
              ? Math.floor((now.getTime() - activeSession.startedAt.getTime()) / 60000)
              : null,
          },
        })
      })
      return reply.send({
        result: { score, isUrgent: shouldBreak, shouldBreakthrough: shouldBreak, reason, category },
        logId: log.id,
      })
    }

    // ── Plan gate: AI urgency analysis is a PRO feature ──────────────────
    // FREE users rely entirely on on-device keyword/app-rule/whitelist handling
    // (above + on the client). We never send their content to Claude, so free
    // users cost zero tokens and leak nothing to the LLM.
    const plan = await getEffectivePlan(userId)
    if (plan !== 'PRO') {
      const now = new Date()
      const log = await prisma.$transaction(async (tx) => {
        await tx.focusSession.updateMany({
          where: { userId, endedAt: null },
          data: { interceptCount: { increment: 1 } },
        })
        const activeSession = await tx.focusSession.findFirst({
          where: { userId, endedAt: null },
          orderBy: { startedAt: 'desc' },
        })
        return tx.behaviorLog.create({
          data: {
            userId,
            senderEmail: body.data.senderContact,
            senderName: body.data.senderName,
            subject: body.data.subject || body.data.content.slice(0, 100),
            preview: body.data.preview || body.data.content.slice(0, 200),
            appName: body.data.appName,
            packageName: body.data.packageName,
            isWhitelisted: false,
            repeatCount: body.data.repeatCount ?? 1,
            hourOfDay: now.getHours(),
            dayOfWeek: now.getDay(),
            aiScore: 0,
            aiCategory: 'normal',
            aiShouldBreak: false,
            aiReason: 'AI urgency analysis is a PRO feature',
            modelVersion: 'free-no-ai',
            focusSessionId: activeSession?.id,
            focusMinute: activeSession
              ? Math.floor((now.getTime() - activeSession.startedAt.getTime()) / 60000)
              : null,
          },
        })
      })
      return reply.send({
        result: { score: 0, isUrgent: false, shouldBreakthrough: false, reason: '免費版不含 AI 分析，訊息已攔截', category: 'normal' as const },
        logId: log.id,
        aiAvailable: false,
      })
    }

    try {
      await checkAndIncrement(userId, 'analyses')
    } catch (err) {
      return handleUsageError(err, reply)
    }

    // ── Whitelist + relationship lookup ──
    const whitelisted = body.data.senderContact
      ? await prisma.whitelist.findFirst({
          where: { userId, contact: { equals: body.data.senderContact, mode: 'insensitive' } },
        })
      : null

    // ── Sender history: find most recent AI category for this sender ──
    const recentLog = body.data.senderName
      ? await prisma.behaviorLog.findFirst({
          where: { userId, senderName: body.data.senderName },
          orderBy: { createdAt: 'desc' },
          select: { aiCategory: true },
        })
      : null

    const now = new Date()
    const result = await analyseUrgency({
      content: body.data.content,
      senderName: body.data.senderName,
      senderContact: body.data.senderContact,
      isWhitelisted: !!whitelisted,
      repeatCount: body.data.repeatCount ?? 1,
      senderRelationship: (whitelisted as any)?.relationship ?? undefined,
      hourOfDay: now.getHours(),
      appName: body.data.appName,
      recentSenderCategory: recentLog?.aiCategory ?? undefined,
    })

    // Use transaction to atomically update session + create log (avoids race condition)
    const log = await prisma.$transaction(async (tx) => {
      await tx.focusSession.updateMany({
        where: { userId, endedAt: null },
        data: { interceptCount: { increment: 1 } },
      })

      const activeSession = await tx.focusSession.findFirst({
        where: { userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      })

      return tx.behaviorLog.create({
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
    })

    return reply.send({ result, logId: log.id })
  })

  // ── POST /ai/analyse-batch ──────────────────────────
  // PRO-only. Analyses up to 50 queued messages in ONE Claude call (the client
  // flushes its queue every ~10 min). Consumes just 1 'analyses' unit, not N.
  app.post('/ai/analyse-batch', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = batchAnalyseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // AI is a PRO feature
    const plan = await getEffectivePlan(userId)
    if (plan !== 'PRO') return reply.status(403).send({ error: 'AI batch analysis is a PRO feature', code: 'PRO_REQUIRED' })

    // One batch = one usage unit (the whole point of batching)
    try {
      await checkAndIncrement(userId, 'analyses')
    } catch (err) {
      return handleUsageError(err, reply)
    }

    // Fetch the user's whitelist once and match in memory (avoids N queries)
    const whitelist = await prisma.whitelist.findMany({ where: { userId } })
    const wlMatch = (contact?: string) =>
      contact ? whitelist.find(w => w.contact.toLowerCase() === contact.toLowerCase()) : undefined

    const now = new Date()
    const results = await analyseUrgencyBatch(body.data.items.map(it => {
      const wl = wlMatch(it.senderContact)
      return {
        content: it.content,
        senderName: it.senderName,
        senderContact: it.senderContact,
        isWhitelisted: !!wl,
        repeatCount: it.repeatCount ?? 1,
        senderRelationship: (wl as any)?.relationship ?? undefined,
        hourOfDay: now.getHours(),
        appName: it.appName,
      }
    }))

    // Persist all logs + bump the active session intercept count in one transaction
    const out = await prisma.$transaction(async (tx) => {
      await tx.focusSession.updateMany({
        where: { userId, endedAt: null },
        data: { interceptCount: { increment: body.data.items.length } },
      })
      const activeSession = await tx.focusSession.findFirst({
        where: { userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      })
      const created = []
      for (let i = 0; i < body.data.items.length; i++) {
        const it = body.data.items[i]
        const r = results[i]
        const wl = wlMatch(it.senderContact)
        const log = await tx.behaviorLog.create({
          data: {
            userId,
            senderEmail: it.senderContact,
            senderName: it.senderName,
            subject: it.subject || it.content.slice(0, 100),
            preview: it.preview || it.content.slice(0, 200),
            appName: it.appName,
            packageName: it.packageName,
            isWhitelisted: !!wl,
            repeatCount: it.repeatCount ?? 1,
            hourOfDay: now.getHours(),
            dayOfWeek: now.getDay(),
            aiScore: r.score,
            aiCategory: r.category as any,
            aiShouldBreak: r.shouldBreakthrough,
            aiReason: r.reason,
            modelVersion: 'claude-haiku-4-5-batch',
            focusSessionId: activeSession?.id,
            focusMinute: activeSession
              ? Math.floor((now.getTime() - activeSession.startedAt.getTime()) / 60000)
              : null,
          },
        })
        created.push({ ...r, logId: log.id })
      }
      return created
    })

    return reply.send({ results: out })
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

    req.log.info({ userId, action: 'AI_FEEDBACK', logId: body.data.logId, userAction: body.data.userAction }, 'AI feedback submitted')
    return reply.send({ ok: true })
  })

  // ── GET /ai/export ──────────────────────────────────
  // Export labelled training data as JSON
  // Only returns logs where userAction is recorded (ground truth exists)
  app.get('/ai/export', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    // Admin key via header (never in URL/query params for security)
    if (!verifyExportKey(req, reply)) return

    req.log.info({ userId, action: 'DATA_EXPORT' }, 'Export accessed')

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
  app.get('/ai/export/csv', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub

    // Admin key via header (never in URL/query params for security)
    if (!verifyExportKey(req, reply)) return

    req.log.info({ userId, action: 'DATA_EXPORT' }, 'Export accessed')

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
    const entry = await prisma.whitelist.create({
      data: {
        userId,
        name: body.data.name,
        contact: body.data.contact,
        relationship: body.data.relationship as any ?? 'other',
        priority: body.data.priority ?? 1,
      },
    })
    req.log.info({ userId, action: 'WHITELIST_ADD', name: body.data.name }, 'Whitelist entry added')
    return reply.status(201).send({ entry })
  })

  app.delete('/ai/whitelist/:id', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { id } = req.params as { id: string }
    const entry = await prisma.whitelist.findFirst({ where: { id, userId } })
    if (!entry) return reply.status(404).send({ error: 'Not found' })
    await prisma.whitelist.delete({ where: { id } })
    req.log.info({ userId, action: 'WHITELIST_REMOVE', entryId: id }, 'Whitelist entry removed')
    return reply.send({ ok: true })
  })

  // ── App Rules CRUD ──────────────────────────────────
  app.get('/ai/app-rules', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const rules = await prisma.appRule.findMany({ where: { userId }, orderBy: { appName: 'asc' } })
    return reply.send({ rules })
  })

  app.post('/ai/app-rules', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const body = appRuleSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const rule = await prisma.appRule.upsert({
      where: { userId_appName: { userId, appName: body.data.appName } },
      create: { userId, appName: body.data.appName, packageName: body.data.packageName, action: body.data.action as any },
      update: { action: body.data.action as any, packageName: body.data.packageName },
    })
    req.log.info({ userId, action: 'APP_RULE_ADD', appName: body.data.appName, ruleAction: body.data.action }, 'App rule added')
    return reply.status(201).send({ rule })
  })

  app.delete('/ai/app-rules/:id', auth, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub
    const { id } = req.params as { id: string }
    const rule = await prisma.appRule.findFirst({ where: { id, userId } })
    if (!rule) return reply.status(404).send({ error: 'Not found' })
    await prisma.appRule.delete({ where: { id } })
    req.log.info({ userId, action: 'APP_RULE_REMOVE', ruleId: id }, 'App rule removed')
    return reply.send({ ok: true })
  })
}