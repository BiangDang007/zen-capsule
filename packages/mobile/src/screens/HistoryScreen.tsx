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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import type { FocusSession } from '@zen-capsule/shared';

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.focus.history(20, 0);
      setSessions(data.sessions);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchHistory();
    }, [fetchHistory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const totalMinutes = Math.round(
    sessions.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0) / 60,
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-TW', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openSession = (session: FocusSession) => {
    if (session.endedAt) {
      navigation.navigate('SessionDetail', { sessionId: session.id });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E8712A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.headerTitle}>Session History</Text>

      {/* Stats Header */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{sessions.length}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {totalMinutes >= 60
              ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
              : `${totalMinutes}m`}
          </Text>
          <Text style={styles.statLabel}>Total Focus</Text>
        </View>
      </View>

      {/* Session List */}
      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#E8712A"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>尚無紀錄</Text>
            <Text style={styles.emptySubtext}>
              開始第一次專注吧！
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCompleted = !!item.endedAt;
          const minutes = Math.max(1, Math.round((item.durationSeconds ?? 0) / 60));
          const intercepted = item.interceptCount ?? 0;

          return (
            <TouchableOpacity
              style={styles.sessionCard}
              activeOpacity={isCompleted ? 0.6 : 1}
              onPress={() => openSession(item)}
              disabled={!isCompleted}>
              <View style={styles.sessionRow}>
                <Text style={styles.sessionDate}>
                  {formatDate(item.startedAt)}
                </Text>
                <Text style={styles.sessionDuration}>
                  {isCompleted ? `${minutes} 分鐘` : '進行中'}
                </Text>
              </View>

              <View style={styles.sessionMeta}>
                <View
                  style={[
                    styles.statusBadge,
                    isCompleted ? styles.badgeComplete : styles.badgeActive,
                  ]}>
                  <Text style={[
                    styles.statusText,
                    isCompleted ? styles.statusComplete : styles.statusActive,
                  ]}>
                    {isCompleted ? 'Completed' : 'Active'}
                  </Text>
                </View>

                {isCompleted && intercepted > 0 && (
                  <View style={styles.interceptBadge}>
                    <Text style={styles.interceptText}>
                      📬 攔截 {intercepted} 則
                    </Text>
                  </View>
                )}

                {isCompleted && (
                  <Text style={styles.tapHint}>點擊查看 ▸</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5EB',
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D1B0E',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF0E0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8D5C0',
    marginHorizontal: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E8712A',
  },
  statLabel: {
    fontSize: 12,
    color: '#7A6652',
    marginTop: 4,
  },
  sessionCard: {
    backgroundColor: '#FFF0E0',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8D5C0',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sessionDate: {
    color: '#2D1B0E',
    fontSize: 14,
  },
  sessionDuration: {
    color: '#E8712A',
    fontSize: 14,
    fontWeight: '600',
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeComplete: {
    backgroundColor: '#28A74518',
  },
  badgeActive: {
    backgroundColor: '#E8712A18',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusComplete: {
    color: '#28A745',
  },
  statusActive: {
    color: '#E8712A',
  },
  interceptBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#E8712A12',
  },
  interceptText: {
    fontSize: 12,
    color: '#E8712A',
    fontWeight: '500',
  },
  tapHint: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#C4B098',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#2D1B0E',
    fontSize: 18,
    fontWeight: '500',
  },
  emptySubtext: {
    color: '#7A6652',
    fontSize: 14,
    marginTop: 4,
  },
});
