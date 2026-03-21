// src/services/usage.service.ts
// Per-user daily Claude API usage tracking and enforcement (plan-aware)
import { prisma } from '../lib/prisma.js'

export const PLAN_LIMITS = {
  FREE: { analyses: 30, summaries: 2 },
  PRO:  { analyses: 500, summaries: 20 },
} as const

export type UsageType = 'analyses' | 'summaries'

export class LimitExceededError extends Error {
  constructor(public readonly type: UsageType, public readonly limit: number) {
    super(`Daily ${type} limit reached (${limit}/day)`)
    this.name = 'LimitExceededError'
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function checkAndIncrement(userId: string, type: UsageType): Promise<void> {
  const date = todayKey()

  await prisma.$transaction(async (tx) => {
    // Get user's plan
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    })

    // Determine effective plan (check expiration)
    let effectivePlan: 'FREE' | 'PRO' = 'FREE'
    if (user?.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > new Date()) {
      effectivePlan = 'PRO'
    }

    const limit = PLAN_LIMITS[effectivePlan][type]

    const record = await tx.dailyUsage.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date },
      update: {},
      select: { analyses: true, summaries: true },
    })

    if (record[type] >= limit) {
      throw new LimitExceededError(type, limit)
    }

    await tx.dailyUsage.update({
      where: { userId_date: { userId, date } },
      data: { [type]: { increment: 1 } },
    })
  }, {
    isolationLevel: 'Serializable',
  })
}

export async function getTodayUsage(userId: string) {
  const date = todayKey()
  const record = await prisma.dailyUsage.findUnique({
    where: { userId_date: { userId, date } },
    select: { analyses: true, summaries: true },
  })
  return record ?? { analyses: 0, summaries: 0 }
}

export async function getUserLimits(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true },
  })
  let effectivePlan: 'FREE' | 'PRO' = 'FREE'
  if (user?.plan === 'PRO' && user.planExpiresAt && user.planExpiresAt > new Date()) {
    effectivePlan = 'PRO'
  }
  return { plan: effectivePlan, limits: PLAN_LIMITS[effectivePlan] }
}
