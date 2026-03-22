import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { api, tryRefreshToken } from '../services/api';
import type {
  SessionReport,
  SessionReportEntry,
  SessionReportEntryWithFeedback,
  UserAction,
} from '@zen-capsule/shared';

// ── Section config ─────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'critical' as const, label: '🔴 緊急', color: '#DC3545' },
  { key: 'important' as const, label: '🟡 重要', color: '#E8912A' },
  { key: 'normal' as const, label: '🟠 普通', color: '#E8712A' },
  { key: 'social' as const, label: '💬 社群', color: '#28A745' },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function BreakReportScreen() {
  // Accept sessionId from navigation params (when opened from History)
  const route = useRoute<any>()
  const routeSessionId = route.params?.sessionId as string | undefined

  const [report, setReport] = useState<SessionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    critical: true,
    important: true,
    normal: false,
    social: false,
  })
  // Track the list of completed sessions for browsing (only when no routeSessionId)
  const [sessionList, setSessionList] = useState<{ id: string; goal: string; startedAt: string }[]>([])
  const [currentSessionIdx, setCurrentSessionIdx] = useState(0)
  // Track which entries have received feedback
  const [feedbackSent, setFeedbackSent] = useState<Record<string, UserAction>>({})

  const fetchReport = useCallback(async (sessionId?: string) => {
    try {
      const data = await api.focus.sessionReport(sessionId)
      setReport(data)
      // Pre-fill feedback state from server data
      const existing: Record<string, UserAction> = {}
      for (const key of ['critical', 'important', 'normal', 'social'] as const) {
        for (const entry of (data[key] as any[])) {
          if (entry.userAction) {
            existing[entry.logId || entry.id] = entry.userAction
          }
        }
      }
      setFeedbackSent(existing)
    } catch (err: any) {
      if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
        const refreshed = await tryRefreshToken()
        if (refreshed) {
          try {
            const data = await api.focus.sessionReport(sessionId)
            setReport(data)
            return
          } catch {
            // Retry failed
          }
        }
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchSessionList = useCallback(async () => {
    try {
      const historyData = await api.focus.history(20, 0)
      const completed = historyData.sessions.filter((s: any) => s.endedAt != null)
      setSessionList(completed.map((s: any) => ({
        id: s.id,
        goal: s.goal,
        startedAt: s.startedAt,
      })))
    } catch {
      // ignore
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      setCurrentSessionIdx(0)
      setFeedbackSent({})
      if (routeSessionId) {
        // Opened from History → load specific session, no session list browsing
        fetchReport(routeSessionId)
      } else {
        // Standalone tab → load latest, enable session browsing
        fetchReport().then(() => fetchSessionList())
      }
    }, [fetchReport, fetchSessionList, routeSessionId])
  )

  const onRefresh = () => {
    setRefreshing(true)
    const currentId = sessionList[currentSessionIdx]?.id
    fetchReport(currentId)
  }

  const goToPrevSession = () => {
    const newIdx = currentSessionIdx + 1
    if (newIdx < sessionList.length) {
      setCurrentSessionIdx(newIdx)
      setLoading(true)
      setFeedbackSent({})
      fetchReport(sessionList[newIdx].id)
    }
  }
  const goToNextSession = () => {
    const newIdx = currentSessionIdx - 1
    if (newIdx >= 0) {
      setCurrentSessionIdx(newIdx)
      setLoading(true)
      setFeedbackSent({})
      fetchReport(sessionList[newIdx].id)
    }
  }

  const toggle = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Feedback handler ────────────────────────────────────────────────────
  const sendFeedback = async (logId: string, userAction: UserAction) => {
    try {
      await api.ai.feedback({ logId, userAction })
      setFeedbackSent(prev => ({ ...prev, [logId]: userAction }))
    } catch {
      // silently fail — feedback is best-effort
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E8712A" />
      </View>
    )
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>尚無紀錄</Text>
        <Text style={styles.emptySubtext}>開始一次專注後，這裡會顯示攔截摘要</Text>
      </View>
    )
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8712A" />
      }
      data={SECTIONS}
      keyExtractor={item => item.key}
      ListHeaderComponent={
        <>
          {/* Session summary banner */}
          <View style={styles.banner}>
            <Text style={styles.bannerGoal}>{report.sessionGoal}</Text>
            <Text style={styles.bannerMeta}>
              {report.durationMinutes} 分鐘 · 攔截 {report.totalIntercepted} 則
            </Text>

            {sessionList.length > 1 && (
              <View style={styles.sessionNav}>
                <TouchableOpacity
                  onPress={goToPrevSession}
                  disabled={currentSessionIdx >= sessionList.length - 1}
                  style={[styles.navBtn, currentSessionIdx >= sessionList.length - 1 && styles.navBtnDisabled]}>
                  <Text style={styles.navBtnText}>◀ 上一次</Text>
                </TouchableOpacity>
                <Text style={styles.navIndicator}>
                  {currentSessionIdx + 1} / {sessionList.length}
                </Text>
                <TouchableOpacity
                  onPress={goToNextSession}
                  disabled={currentSessionIdx <= 0}
                  style={[styles.navBtn, currentSessionIdx <= 0 && styles.navBtnDisabled]}>
                  <Text style={styles.navBtnText}>下一次 ▶</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Ads strip */}
          {report.ads.count > 0 && (
            <View style={styles.adsStrip}>
              <Text style={styles.adsText}>
                🛒 已靜默擋下 {report.ads.count} 則廣告
                {report.ads.topApps.length > 0
                  ? `（${report.ads.topApps.slice(0, 3).join('、')}）`
                  : ''}
              </Text>
            </View>
          )}
        </>
      }
      renderItem={({ item: section }) => {
        const entries = report[section.key] as (SessionReportEntry & Partial<SessionReportEntryWithFeedback>)[]
        if (entries.length === 0) return null
        const isOpen = expanded[section.key]

        return (
          <View style={styles.section}>
            {/* Section header */}
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggle(section.key)}
              activeOpacity={0.7}>
              <Text style={[styles.sectionLabel, { color: section.color }]}>
                {section.label}
              </Text>
              <Text style={styles.sectionCount}>{entries.length} 則</Text>
              <Text style={[styles.chevron, { color: section.color }]}>
                {isOpen ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {/* Entries */}
            {isOpen &&
              entries.map(entry => {
                const logId = (entry as any).logId as string | undefined
                const aiReason = (entry as any).aiReason as string | null | undefined
                const sentAction = logId ? feedbackSent[logId] : undefined

                return (
                  <View key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryRow}>
                      <Text style={styles.entryApp}>
                        {entry.appName ?? entry.packageName ?? '未知 App'}
                      </Text>
                      <Text style={styles.entryTime}>
                        {formatRelativeTime(entry.createdAt)}
                      </Text>
                    </View>
                    {entry.senderName ? (
                      <Text style={styles.entrySender}>{entry.senderName}</Text>
                    ) : null}
                    <Text style={styles.entrySubject} numberOfLines={1}>
                      {entry.subject}
                    </Text>
                    {entry.preview ? (
                      <Text style={styles.entryPreview} numberOfLines={2}>
                        {entry.preview}
                      </Text>
                    ) : null}

                    {/* AI reason */}
                    {aiReason ? (
                      <Text style={styles.aiReason}>AI: {aiReason}</Text>
                    ) : null}

                    {entry.aiShouldBreak && (
                      <View style={styles.breakthroughBadge}>
                        <Text style={styles.breakthroughText}>已穿透通知</Text>
                      </View>
                    )}

                    {/* Feedback buttons */}
                    {logId ? (
                      <View style={styles.feedbackRow}>
                        {sentAction ? (
                          <View style={styles.feedbackSent}>
                            <Text style={styles.feedbackSentText}>
                              {sentAction === 'CONFIRMED_BLOCK' || sentAction === 'DISMISSED'
                                ? '✅ 判斷正確'
                                : sentAction === 'MARKED_URGENT'
                                  ? '⬆️ 應更緊急'
                                  : sentAction === 'MARKED_NOT_URGENT'
                                    ? '⬇️ 不需要這麼緊急'
                                    : '已回饋'}
                            </Text>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.feedbackLabel}>AI 判斷正確嗎？</Text>
                            <View style={styles.feedbackButtons}>
                              <TouchableOpacity
                                style={styles.fbBtnCorrect}
                                onPress={() => sendFeedback(
                                  logId,
                                  entry.aiShouldBreak ? 'ALLOWED_THROUGH' : 'CONFIRMED_BLOCK'
                                )}>
                                <Text style={styles.fbBtnCorrectText}>👍 正確</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.fbBtnWrong}
                                onPress={() => sendFeedback(
                                  logId,
                                  entry.aiShouldBreak ? 'MARKED_NOT_URGENT' : 'MARKED_URGENT'
                                )}>
                                <Text style={styles.fbBtnWrongText}>👎 不對</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>
                )
              })}
          </View>
        )
      }}
      ListEmptyComponent={null}
    />
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const h = Math.floor(min / 60)
  return `${h} 小時前`
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5EB' },
  content: { paddingBottom: 32 },
  centered: {
    flex: 1, backgroundColor: '#FFF5EB',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#2D1B0E', fontSize: 18, fontWeight: '500' },
  emptySubtext: { color: '#7A6652', fontSize: 14, marginTop: 6, textAlign: 'center' },

  // Banner
  banner: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF0E0',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8D5C0',
  },
  bannerGoal: { color: '#2D1B0E', fontSize: 16, fontWeight: '600' },
  bannerMeta: { color: '#7A6652', fontSize: 13, marginTop: 4 },
  sessionNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8D5C0',
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E8D5C0',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#E8712A', fontSize: 13, fontWeight: '600' },
  navIndicator: { color: '#7A6652', fontSize: 12 },

  // Ads strip
  adsStrip: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#F5EDE3',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0D0C0',
  },
  adsText: { color: '#8B7355', fontSize: 13 },

  // Section
  section: { marginHorizontal: 16, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  sectionCount: { color: '#7A6652', fontSize: 13, marginRight: 8 },
  chevron: { fontSize: 11 },

  // Entry card
  entryCard: {
    backgroundColor: '#FFF0E0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E8D5C0',
  },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  entryApp: { color: '#E8712A', fontSize: 12, fontWeight: '600' },
  entryTime: { color: '#A89880', fontSize: 12 },
  entrySender: { color: '#8B7355', fontSize: 13, marginBottom: 2 },
  entrySubject: { color: '#2D1B0E', fontSize: 14, fontWeight: '500' },
  entryPreview: { color: '#7A6652', fontSize: 13, marginTop: 3 },

  // AI reason
  aiReason: {
    color: '#8B7355',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0E0D0',
  },

  breakthroughBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#DC354518', borderRadius: 6,
  },
  breakthroughText: { color: '#DC3545', fontSize: 11, fontWeight: '600' },

  // Feedback
  feedbackRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0E0D0',
  },
  feedbackLabel: {
    color: '#A89880',
    fontSize: 12,
    marginBottom: 6,
  },
  feedbackButtons: {
    flexDirection: 'row',
  },
  fbBtnCorrect: {
    flex: 1,
    backgroundColor: '#28A74518',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#28A74530',
    marginRight: 4,
  },
  fbBtnCorrectText: {
    color: '#28A745',
    fontSize: 13,
    fontWeight: '600',
  },
  fbBtnWrong: {
    flex: 1,
    backgroundColor: '#DC354518',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DC354530',
    marginLeft: 4,
  },
  fbBtnWrongText: {
    color: '#DC3545',
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackSent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  feedbackSentText: {
    color: '#7A6652',
    fontSize: 12,
    fontWeight: '500',
  },
})
