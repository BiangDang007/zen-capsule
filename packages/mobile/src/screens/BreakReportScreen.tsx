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
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { api, tryRefreshToken } from '../services/api';
import type {
  SessionReport,
  SessionReportEntry,
  SessionReportEntryWithFeedback,
  UserAction,
} from '@zen-capsule/shared';

// ── Component ──────────────────────────────────────────────────────────────

export default function BreakReportScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const routeSessionId = route.params?.sessionId as string | undefined;

  const SECTIONS = [
    { key: 'critical' as const, label: t('breakReport.critical'), color: '#DC3545' },
    { key: 'important' as const, label: t('breakReport.important'), color: '#E8912A' },
    { key: 'normal' as const, label: t('breakReport.normal'), color: '#E8712A' },
    { key: 'social' as const, label: t('breakReport.social'), color: '#28A745' },
  ];

  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    critical: true,
    important: true,
    normal: false,
    social: false,
  });
  const [sessionList, setSessionList] = useState<{ id: string; goal: string; startedAt: string }[]>([]);
  const [currentSessionIdx, setCurrentSessionIdx] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, UserAction>>({});

  const fetchReport = useCallback(async (sessionId?: string) => {
    try {
      const data = await api.focus.sessionReport(sessionId);
      setReport(data);
      const existing: Record<string, UserAction> = {};
      for (const key of ['critical', 'important', 'normal', 'social'] as const) {
        for (const entry of (data[key] as any[])) {
          if (entry.userAction) {
            existing[entry.logId || entry.id] = entry.userAction;
          }
        }
      }
      setFeedbackSent(existing);
    } catch (err: any) {
      if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          try {
            const data = await api.focus.sessionReport(sessionId);
            setReport(data);
            return;
          } catch {
            // Retry failed
          }
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchSessionList = useCallback(async () => {
    try {
      const historyData = await api.focus.history(20, 0);
      const completed = historyData.sessions.filter((s: any) => s.endedAt != null);
      setSessionList(completed.map((s: any) => ({
        id: s.id,
        goal: s.goal,
        startedAt: s.startedAt,
      })));
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setCurrentSessionIdx(0);
      setFeedbackSent({});
      if (routeSessionId) {
        fetchReport(routeSessionId);
      } else {
        fetchReport().then(() => fetchSessionList());
      }
    }, [fetchReport, fetchSessionList, routeSessionId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    const currentId = sessionList[currentSessionIdx]?.id;
    fetchReport(currentId);
  };

  const goToPrevSession = () => {
    const newIdx = currentSessionIdx + 1;
    if (newIdx < sessionList.length) {
      setCurrentSessionIdx(newIdx);
      setLoading(true);
      setFeedbackSent({});
      fetchReport(sessionList[newIdx].id);
    }
  };
  const goToNextSession = () => {
    const newIdx = currentSessionIdx - 1;
    if (newIdx >= 0) {
      setCurrentSessionIdx(newIdx);
      setLoading(true);
      setFeedbackSent({});
      fetchReport(sessionList[newIdx].id);
    }
  };

  const toggle = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const sendFeedback = async (logId: string, userAction: UserAction) => {
    try {
      await api.ai.feedback({ logId, userAction });
      setFeedbackSent(prev => ({ ...prev, [logId]: userAction }));
    } catch {
      // silently fail
    }
  };

  const formatRelativeTime = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('breakReport.justNow');
    if (min < 60) return t('breakReport.minutesAgo', { minutes: min });
    const h = Math.floor(min / 60);
    return t('breakReport.hoursAgo', { hours: h });
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E8712A" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>{t('breakReport.noRecords')}</Text>
        <Text style={styles.emptySubtext}>{t('breakReport.noRecordsHint')}</Text>
      </View>
    );
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
              {t('breakReport.durationMeta', {
                minutes: report.durationMinutes,
                count: report.totalIntercepted,
              })}
            </Text>

            {sessionList.length > 1 && (
              <View style={styles.sessionNav}>
                <TouchableOpacity
                  onPress={goToPrevSession}
                  disabled={currentSessionIdx >= sessionList.length - 1}
                  style={[styles.navBtn, currentSessionIdx >= sessionList.length - 1 && styles.navBtnDisabled]}>
                  <Text style={styles.navBtnText}>{t('breakReport.prevSession')}</Text>
                </TouchableOpacity>
                <Text style={styles.navIndicator}>
                  {currentSessionIdx + 1} / {sessionList.length}
                </Text>
                <TouchableOpacity
                  onPress={goToNextSession}
                  disabled={currentSessionIdx <= 0}
                  style={[styles.navBtn, currentSessionIdx <= 0 && styles.navBtnDisabled]}>
                  <Text style={styles.navBtnText}>{t('breakReport.nextSession')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Ads strip */}
          {report.ads.count > 0 && (
            <View style={styles.adsStrip}>
              <Text style={styles.adsText}>
                {t('breakReport.adsBlocked', {
                  count: report.ads.count,
                  apps: report.ads.topApps.length > 0
                    ? `（${report.ads.topApps.slice(0, 3).join('、')}）`
                    : '',
                })}
              </Text>
            </View>
          )}
        </>
      }
      renderItem={({ item: section }) => {
        const entries = report[section.key] as (SessionReportEntry & Partial<SessionReportEntryWithFeedback>)[];
        if (entries.length === 0) return null;
        const isOpen = expanded[section.key];

        return (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggle(section.key)}
              activeOpacity={0.7}>
              <Text style={[styles.sectionLabel, { color: section.color }]}>
                {section.label}
              </Text>
              <Text style={styles.sectionCount}>
                {t('breakReport.entryCount', { count: entries.length })}
              </Text>
              <Text style={[styles.chevron, { color: section.color }]}>
                {isOpen ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {isOpen &&
              entries.map(entry => {
                const logId = (entry as any).logId as string | undefined;
                const aiReason = (entry as any).aiReason as string | null | undefined;
                const sentAction = logId ? feedbackSent[logId] : undefined;

                return (
                  <View key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryRow}>
                      <Text style={styles.entryApp}>
                        {entry.appName ?? entry.packageName ?? t('breakReport.unknownApp')}
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

                    {aiReason ? (
                      <Text style={styles.aiReason}>AI: {aiReason}</Text>
                    ) : null}

                    {entry.aiShouldBreak && (
                      <View style={styles.breakthroughBadge}>
                        <Text style={styles.breakthroughText}>{t('breakReport.breakthroughSent')}</Text>
                      </View>
                    )}

                    {logId ? (
                      <View style={styles.feedbackRow}>
                        {sentAction ? (
                          <View style={styles.feedbackSent}>
                            <Text style={styles.feedbackSentText}>
                              {sentAction === 'CONFIRMED_BLOCK' || sentAction === 'DISMISSED'
                                ? t('breakReport.correct')
                                : sentAction === 'MARKED_URGENT'
                                  ? t('breakReport.shouldBeUrgent')
                                  : sentAction === 'MARKED_NOT_URGENT'
                                    ? t('breakReport.notSoUrgent')
                                    : t('breakReport.feedbackSent')}
                            </Text>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.feedbackLabel}>{t('breakReport.aiFeedbackQ')}</Text>
                            <View style={styles.feedbackButtons}>
                              <TouchableOpacity
                                style={styles.fbBtnCorrect}
                                onPress={() => sendFeedback(
                                  logId,
                                  entry.aiShouldBreak ? 'ALLOWED_THROUGH' : 'CONFIRMED_BLOCK'
                                )}>
                                <Text style={styles.fbBtnCorrectText}>{t('breakReport.thumbsUp')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.fbBtnWrong}
                                onPress={() => sendFeedback(
                                  logId,
                                  entry.aiShouldBreak ? 'MARKED_NOT_URGENT' : 'MARKED_URGENT'
                                )}>
                                <Text style={styles.fbBtnWrongText}>{t('breakReport.thumbsDown')}</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
          </View>
        );
      }}
      ListEmptyComponent={null}
    />
  );
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

  section: { marginHorizontal: 16, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  sectionCount: { color: '#7A6652', fontSize: 13, marginEnd: 8 },
  chevron: { fontSize: 11 },

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
    marginEnd: 4,
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
    marginStart: 4,
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
});
