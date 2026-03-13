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
import type { SessionReport, SessionReportEntry } from '@zen-capsule/shared';

// ── Section config ─────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'critical' as const, label: '🔴 緊急', color: '#FF4757' },
  { key: 'important' as const, label: '🟡 重要', color: '#FFA502' },
  { key: 'normal' as const, label: '🔵 普通', color: '#6C63FF' },
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

  const fetchReport = useCallback(async (sessionId?: string) => {
    try {
      console.log('[BreakReport] fetching session report...', sessionId ?? '(latest)')
      const data = await api.focus.sessionReport(sessionId)
      console.log('[BreakReport] got report:', JSON.stringify(data).substring(0, 200))
      setReport(data)
    } catch (err: any) {
      console.error('[BreakReport] ERROR:', err?.message ?? err)

      // Auto-refresh token on 401 and retry once
      if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
        console.log('[BreakReport] Token expired, attempting refresh...')
        const refreshed = await tryRefreshToken()
        if (refreshed) {
          try {
            const data = await api.focus.sessionReport(sessionId)
            setReport(data)
            return
          } catch (retryErr: any) {
            console.error('[BreakReport] Retry failed:', retryErr?.message)
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
      // Only completed sessions (they have durationSeconds > 0)
      const completed = historyData.sessions.filter((s: any) => s.endedAt != null)
      setSessionList(completed.map((s: any) => ({
        id: s.id,
        goal: s.goal,
        startedAt: s.startedAt,
      })))
    } catch {
      // ignore — session list is a nice-to-have
    }
  }, [])

  // Re-fetch every time the tab gains focus (not just on mount)
  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      setCurrentSessionIdx(0)
      fetchReport()
      fetchSessionList()
    }, [fetchReport, fetchSessionList])
  )

  const onRefresh = () => { setRefreshing(true); fetchReport() }

  // Navigate between sessions
  const goToPrevSession = () => {
    const newIdx = currentSessionIdx + 1
    if (newIdx < sessionList.length) {
      setCurrentSessionIdx(newIdx)
      setLoading(true)
      fetchReport(sessionList[newIdx].id)
    }
  }
  const goToNextSession = () => {
    const newIdx = currentSessionIdx - 1
    if (newIdx >= 0) {
      setCurrentSessionIdx(newIdx)
      setLoading(true)
      fetchReport(sessionList[newIdx].id)
    }
  }

  const toggle = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" />
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

            {/* Session navigation arrows */}
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
        const entries: SessionReportEntry[] = report[section.key]
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
              entries.map(entry => (
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
                  {entry.aiShouldBreak && (
                    <View style={styles.breakthroughBadge}>
                      <Text style={styles.breakthroughText}>已穿透通知</Text>
                    </View>
                  )}
                </View>
              ))}
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
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  content: { paddingBottom: 32 },
  centered: {
    flex: 1, backgroundColor: '#0F0F1A',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#E0E0FF', fontSize: 18, fontWeight: '500' },
  emptySubtext: { color: '#8888AA', fontSize: 14, marginTop: 6, textAlign: 'center' },

  // Banner
  banner: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  bannerGoal: { color: '#E0E0FF', fontSize: 16, fontWeight: '600' },
  bannerMeta: { color: '#8888AA', fontSize: 13, marginTop: 4 },
  sessionNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2A4A',
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2A2A4A',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#6C63FF', fontSize: 13, fontWeight: '600' },
  navIndicator: { color: '#8888AA', fontSize: 12 },

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
  sectionCount: { color: '#8888AA', fontSize: 13, marginRight: 8 },
  chevron: { fontSize: 11 },

  // Entry card
  entryCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  entryApp: { color: '#6C63FF', fontSize: 12, fontWeight: '600' },
  entryTime: { color: '#555577', fontSize: 12 },
  entrySender: { color: '#AAAACC', fontSize: 13, marginBottom: 2 },
  entrySubject: { color: '#E0E0FF', fontSize: 14, fontWeight: '500' },
  entryPreview: { color: '#8888AA', fontSize: 13, marginTop: 3 },

  breakthroughBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#FF475722', borderRadius: 6,
  },
  breakthroughText: { color: '#FF4757', fontSize: 11, fontWeight: '600' },
})
