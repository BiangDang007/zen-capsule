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
import { useFocusEffect } from '@react-navigation/native';
import { api, tryRefreshToken } from '../services/api';
import type {
  SessionReport,
  SessionReportEntry,
  SessionReportEntryWithFeedback,
  UserAction,
} from '@zen-capsule/shared';

// ── Section config ─────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'critical' as const, label: '🔴 緊急', color: '#FF6348' },
  { key: 'important' as const, label: '🟡 重要', color: '#FFA502' },
  { key: 'normal' as const, label: '🟠 普通', color: '#FF9F43' },
  { key: 'social' as const, label: '💬 社群', color: '#2ECC71' },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function BreakReportScreen() {
  const [report, setReport] = useState<SessionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    critical: true,
    important: true,
    normal: false,
    social: false,
  })
  // Track the list of completed sessions for browsing
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
      // Fetch report first (may auto-close orphaned sessions), then refresh session list
      fetchReport().then(() => fetchSessionList())
    }, [fetchReport, fetchSessionList])
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
        <ActivityIndicator size="large" color="#FF9F43" />
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9F43" />
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
  container: { flex: 1, backgroundColor: '#1A1410' },
  content: { paddingBottom: 32 },
  centered: {
    flex: 1, backgroundColor: '#1A1410',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#FFF0E0', fontSize: 18, fontWeight: '500' },
  emptySubtext: { color: '#AA9080', fontSize: 14, marginTop: 6, textAlign: 'center' },

  // Banner
  banner: {
    margin: 16,
    padding: 16,
    backgroundColor: '#2A2018',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#4A3828',
  },
  bannerGoal: { color: '#FFF0E0', fontSize: 16, fontWeight: '600' },
  bannerMeta: { color: '#AA9080', fontSize: 13, marginTop: 4 },
  sessionNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#4A3828',
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#4A3828',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#FF9F43', fontSize: 13, fontWeight: '600' },
  navIndicator: { color: '#AA9080', fontSize: 12 },

  // Ads strip
  adsStrip: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#1A1210',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#332211',
  },
  adsText: { color: '#AA8866', fontSize: 13 },

  // Section
  section: { marginHorizontal: 16, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  sectionCount: { color: '#AA9080', fontSize: 13, marginRight: 8 },
  chevron: { fontSize: 11 },

  // Entry card
  entryCard: {
    backgroundColor: '#2A2018',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#4A3828',
  },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  entryApp: { color: '#FF9F43', fontSize: 12, fontWeight: '600' },
  entryTime: { color: '#887766', fontSize: 12 },
  entrySender: { color: '#CCAA88', fontSize: 13, marginBottom: 2 },
  entrySubject: { color: '#FFF0E0', fontSize: 14, fontWeight: '500' },
  entryPreview: { color: '#AA9080', fontSize: 13, marginTop: 3 },

  // AI reason
  aiReason: {
    color: '#CCAA88',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#3D2E22',
  },

  breakthroughBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#FF634822', borderRadius: 6,
  },
  breakthroughText: { color: '#FF6348', fontSize: 11, fontWeight: '600' },

  // Feedback
  feedbackRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#3D2E22',
  },
  feedbackLabel: {
    color: '#887766',
    fontSize: 12,
    marginBottom: 6,
  },
  feedbackButtons: {
    flexDirection: 'row',
  },
  fbBtnCorrect: {
    flex: 1,
    backgroundColor: '#2ECC7122',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2ECC7144',
    marginRight: 4,
  },
  fbBtnCorrectText: {
    color: '#2ECC71',
    fontSize: 13,
    fontWeight: '600',
  },
  fbBtnWrong: {
    flex: 1,
    backgroundColor: '#FF634822',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF634844',
    marginLeft: 4,
  },
  fbBtnWrongText: {
    color: '#FF6348',
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackSent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  feedbackSentText: {
    color: '#AA9080',
    fontSize: 12,
    fontWeight: '500',
  },
})
