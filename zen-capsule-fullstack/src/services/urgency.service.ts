// src/services/urgency.service.ts

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types ──────────────────────────────────────────
export interface UrgencyResult {
  score: number
  isUrgent: boolean
  shouldBreakthrough: boolean
  reason: string
  category: 'critical' | 'important' | 'normal' | 'social'
}

export interface MessageContext {
  content: string
  senderName?: string
  senderContact?: string
  isWhitelisted: boolean
  repeatCount?: number
}

export interface EmailSummaryResult {
  urgent: { from: string; subject: string; summary: string }[]
  todo:   { from: string; subject: string; summary: string }[]
  personal: { from: string; subject: string; summary: string }[]
  adsCount: number
}

export interface TaskStep {
  order: number
  task: string
  estimatedMinutes: number
}

export interface TaskBreakdownResult {
  steps: TaskStep[]
  totalMinutes: number
}

// ════════════════════════════════════════════════════
// PROMPT 1 — 緊急判斷（每封訊息進來時呼叫）
// 用 Haiku：速度快、成本低，判斷夠用
// ════════════════════════════════════════════════════
const URGENCY_PROMPT = `You are the focus firewall for Zen Capsule.
Analyse the incoming message and score its urgency.

SCORING:
- CRITICAL (80-100): Cannot wait even 25 minutes. System down, medical emergency, irreversible loss within the hour.
- IMPORTANT (50-79): Needs response today. Time-sensitive but not immediate.
- NORMAL (20-49): Can wait until break time.
- SOCIAL (0-19): Casual chat, newsletters, FYI.

BOOST SCORE IF:
- Contains: 掛了/crashed/down/urgent/ASAP/立刻/馬上/緊急/fire
- Sender is boss, client, or family member
- Same sender has messaged 3+ times
- Mentions specific deadlines or financial loss

Always return valid JSON only. No prose.`

export async function analyseUrgency(ctx: MessageContext): Promise<UrgencyResult> {
  const userPrompt = `Analyse this message:

Content: "${ctx.content}"
Sender: ${ctx.senderName ?? 'Unknown'} (${ctx.senderContact ?? 'unknown'})
Whitelisted: ${ctx.isWhitelisted}
Messages from sender in last 5min: ${ctx.repeatCount ?? 1}

Return JSON:
{
  "score": <0-100>,
  "isUrgent": <boolean>,
  "shouldBreakthrough": <boolean>,
  "reason": "<one sentence in zh-TW>",
  "category": "critical" | "important" | "normal" | "social"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',  // 快 + 便宜，夠用
    max_tokens: 256,
    system: URGENCY_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as UrgencyResult

  // 白名單 + 高分 → 強制穿透
  if (ctx.isWhitelisted && parsed.score >= 80) {
    parsed.shouldBreakthrough = true
  }

  // 奪命連環傳 → 強制穿透
  if ((ctx.repeatCount ?? 1) >= 5) {
    parsed.shouldBreakthrough = true
    parsed.reason += ' [連環傳訊觸發穿透]'
  }

  return parsed
}

// ════════════════════════════════════════════════════
// PROMPT 2 — 休息時整理信件（專注結束後呼叫一次）
// 用 Sonnet：需要理解語意 + 分類，準確度更重要
// ════════════════════════════════════════════════════
const EMAIL_SUMMARY_PROMPT = `You are the break-time assistant for Zen Capsule.
The user just finished a focus session. Summarise the intercepted messages.

Classify each message into ONE of:
- urgent: work messages that require a reply today
- todo: work messages, no urgent reply needed
- personal: family or friends
- ads: newsletters, promotions (just count these, don't list)

RULES:
- One line per message, be concise
- Ignore and just count ads

Always return valid JSON only. No prose.`

export async function summariseEmails(emails: {
  from: string
  subject: string
  preview: string
}[]): Promise<EmailSummaryResult> {
  const userPrompt = `Summarise these ${emails.length} intercepted emails:

${emails.map((e, i) => `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}\n   Preview: ${e.preview}`).join('\n\n')}

Return JSON:
{
  "urgent":   [{"from": "", "subject": "", "summary": ""}],
  "todo":     [{"from": "", "subject": "", "summary": ""}],
  "personal": [{"from": "", "subject": "", "summary": ""}],
  "adsCount": <number>
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',  // 理解語意分類，用 Sonnet
    max_tokens: 1200,
    system: EMAIL_SUMMARY_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text
  return JSON.parse(raw.replace(/```json|```/g, '').trim()) as EmailSummaryResult
}

// ════════════════════════════════════════════════════
// PROMPT 3 — 任務拆解（用戶輸入目標時呼叫）
// 用 Sonnet：需要規劃能力
// ════════════════════════════════════════════════════
const TASK_BREAKDOWN_PROMPT = `You are a focus coach for Zen Capsule.
Break the user's work goal into clear, sequential steps for one focus session.

RULES:
- Maximum 5 steps
- Each step: 5-20 minutes
- Be specific and actionable


Always return valid JSON only. No prose.`

export async function breakdownTask(goal: string, durationMinutes: number): Promise<TaskBreakdownResult> {
  const userPrompt = `Goal: "${goal}"
Available focus time: ${durationMinutes} minutes

Return JSON:
{
  "steps": [
    {"order": 1, "task": "", "estimatedMinutes": <number>}
  ],
  "totalMinutes": <number>
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: TASK_BREAKDOWN_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = (message.content[0] as { type: string; text: string }).text
  return JSON.parse(raw.replace(/```json|```/g, '').trim()) as TaskBreakdownResult
}