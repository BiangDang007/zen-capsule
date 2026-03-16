import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { WhitelistEntry } from '@zen-capsule/shared';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [urgentOnlyMode, setUrgentOnlyMode] = useState(true);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [newSender, setNewSender] = useState('');

  useEffect(() => {
    api.ai.getWhitelist().then(res => setWhitelist(res.whitelist)).catch(() => {});
  }, []);

  const handleAddWhitelist = async () => {
    if (!newSender.trim()) return;
    try {
      const { entry } = await api.ai.addWhitelist({ name: newSender.trim(), contact: newSender.trim() });
      setWhitelist(prev => [...prev, entry]);
      setNewSender('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRemoveWhitelist = async (id: string) => {
    try {
      await api.ai.removeWhitelist(id);
      setWhitelist(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Account */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || '—'}</Text>
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>Urgent Notifications</Text>
            <Text style={styles.hint}>
              Allow urgent messages to break through
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#4A3828', true: '#FF9F4388' }}
            thumbColor={notificationsEnabled ? '#FF9F43' : '#665544'}
          />
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>AI Urgent-Only Mode</Text>
            <Text style={styles.hint}>
              Use Claude AI to judge urgency
            </Text>
          </View>
          <Switch
            value={urgentOnlyMode}
            onValueChange={setUrgentOnlyMode}
            trackColor={{ false: '#4A3828', true: '#FF9F4388' }}
            thumbColor={urgentOnlyMode ? '#FF9F43' : '#665544'}
          />
        </View>
      </View>

      {/* Whitelist */}
      <Text style={styles.sectionTitle}>Whitelist (Always Allow)</Text>
      <View style={styles.card}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Add sender email..."
            placeholderTextColor="#887766"
            value={newSender}
            onChangeText={setNewSender}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddWhitelist}>
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        {whitelist.map(entry => (
          <View key={entry.id} style={styles.whitelistRow}>
            <Text style={styles.whitelistSender}>{entry.name} ({entry.contact})</Text>
            <TouchableOpacity
              onPress={() => handleRemoveWhitelist(entry.id)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        {whitelist.length === 0 && (
          <Text style={styles.emptyText}>No whitelisted senders</Text>
        )}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.version}>Zen Capsule v0.1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1410',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    color: '#FF9F43',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 24,
  },
  card: {
    backgroundColor: '#2A2018',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4A3828',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    color: '#FFF0E0',
    fontSize: 16,
  },
  value: {
    color: '#AA9080',
    fontSize: 14,
    marginTop: 4,
  },
  hint: {
    color: '#887766',
    fontSize: 12,
    marginTop: 2,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  addInput: {
    flex: 1,
    backgroundColor: '#1A1410',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF0E0',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#FF9F43',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFF5EB',
    fontWeight: '600',
  },
  whitelistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#4A3828',
  },
  whitelistSender: {
    color: '#FFF0E0',
    fontSize: 14,
  },
  removeText: {
    color: '#FF6348',
    fontSize: 13,
  },
  emptyText: {
    color: '#887766',
    fontSize: 13,
    fontStyle: 'italic',
  },
  signOutButton: {
    marginTop: 32,
    backgroundColor: '#FF634822',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF634844',
  },
  signOutText: {
    color: '#FF6348',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  version: {
    color: '#665544',
    fontSize: 12,
  },
});
