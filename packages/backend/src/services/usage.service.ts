// src/services/usage.service.ts
// Per-user daily Claude API usage tracking and enforcement
import { prisma } from '../lib/prisma.js'

export const DAILY_LIMITS = {
  analyses:  300,  // Claude Haiku — urgency checks (Android fires these on every notification)
  summaries: 20,   // Claude Sonnet — email batch summaries
} as const

export type UsageType = keyof typeof DAILY_LIMITS

export class LimitExceededError extends Error {
  constructor(public readonly type: UsageType, public readonly limit: number) {
    super(`Daily ${type} limit reached (${limit}/day)`)
    this.name = 'LimitExceededError'
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // "2024-01-15"
}

/**
 * Atomically check-and-increment the daily counter for `type`.
 * Throws LimitExceededError if the limit would be exceeded.
 *
 * Uses a Prisma interactive transaction with serializable isolation
 * to prevent race conditions (two concurrent requests both reading
 * count=299 and both incrementing past the 300 limit).
 */
export async function checkAndIncrement(userId: string, type: UsageType): Promise<void> {
  const date = todayKey()
  const limit = DAILY_LIMITS[type]

  await prisma.$transaction(async (tx) => {
    // Upsert inside the transaction
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
    isolationLevel: 'Serializable', // prevents concurrent reads from both passing the check
  })
}

/** Read today's counters for a user (used by /sync/state or a future dashboard). */
export async function getTodayUsage(userId: string) {
  const date = todayKey()
  const record = await prisma.dailyUsage.findUnique({
    where: { userId_date: { userId, date } },
    select: { analyses: true, summaries: true },
  })
  return record ?? { analyses: 0, summaries: 0 }
}
