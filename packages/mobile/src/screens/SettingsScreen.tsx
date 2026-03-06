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
import * as api from '../services/api';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [urgentOnlyMode, setUrgentOnlyMode] = useState(true);
  const [whitelist, setWhitelist] = useState<api.WhitelistEntry[]>([]);
  const [newSender, setNewSender] = useState('');

  useEffect(() => {
    api.getWhitelist().then(res => setWhitelist(res.whitelist)).catch(() => {});
  }, []);

  const handleAddWhitelist = async () => {
    if (!newSender.trim()) return;
    try {
      const { entry } = await api.addWhitelist(newSender.trim(), newSender.trim());
      setWhitelist(prev => [...prev, entry]);
      setNewSender('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRemoveWhitelist = async (id: string) => {
    try {
      await api.removeWhitelist(id);
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
            trackColor={{ false: '#2A2A4A', true: '#6C63FF88' }}
            thumbColor={notificationsEnabled ? '#6C63FF' : '#555'}
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
            trackColor={{ false: '#2A2A4A', true: '#6C63FF88' }}
            thumbColor={urgentOnlyMode ? '#6C63FF' : '#555'}
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
            placeholderTextColor="#666"
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
    backgroundColor: '#0F0F1A',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 24,
  },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A4A',
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
    color: '#E0E0FF',
    fontSize: 16,
  },
  value: {
    color: '#8888AA',
    fontSize: 14,
    marginTop: 4,
  },
  hint: {
    color: '#666',
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
    backgroundColor: '#0F0F1A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E0E0FF',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  whitelistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2A4A',
  },
  whitelistSender: {
    color: '#E0E0FF',
    fontSize: 14,
  },
  removeText: {
    color: '#FF4757',
    fontSize: 13,
  },
  emptyText: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
  },
  signOutButton: {
    marginTop: 32,
    backgroundColor: '#FF475722',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF475744',
  },
  signOutText: {
    color: '#FF4757',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  version: {
    color: '#555',
    fontSize: 12,
  },
});
