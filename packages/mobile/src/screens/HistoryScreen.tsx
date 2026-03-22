import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import type { FocusSession } from '@zen-capsule/shared';

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.focus.history();
      setSessions(data.sessions);
    } catch {
      // Silently handle — could show a toast
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E8712A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
            <Text style={styles.emptyText}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>
              Start your first focus session!
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.sessionCard}>
            <View style={styles.sessionRow}>
              <Text style={styles.sessionDate}>
                {formatDate(item.startedAt)}
              </Text>
              <Text style={styles.sessionDuration}>
                {item.endedAt
                  ? `${Math.max(1, Math.round((item.durationSeconds ?? 0) / 60))} min`
                  : 'In progress'}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                item.endedAt ? styles.badgeComplete : styles.badgeActive,
              ]}>
              <Text style={styles.statusText}>
                {item.endedAt ? 'Completed' : 'Active'}
              </Text>
            </View>
          </View>
        )}
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
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeComplete: {
    backgroundColor: '#2ECC7122',
  },
  badgeActive: {
    backgroundColor: '#E8712A18',
  },
  statusText: {
    fontSize: 12,
    color: '#7A6652',
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
