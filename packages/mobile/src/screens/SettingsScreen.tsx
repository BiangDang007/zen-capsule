import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  InteractionManager,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type {
  WhitelistEntry,
  SenderRelationship,
  AppRule,
  AppRuleAction,
} from '@zen-capsule/shared';

// ── Constants ──────────────────────────────────────────────────────────────

const RELATIONSHIPS: { value: SenderRelationship; label: string }[] = [
  { value: 'boss', label: '老闆' },
  { value: 'client', label: '客戶' },
  { value: 'family', label: '家人' },
  { value: 'friend', label: '朋友' },
  { value: 'coworker', label: '同事' },
  { value: 'other', label: '其他' },
]

const RELATIONSHIP_LABELS: Record<SenderRelationship, string> = {
  boss: '老闆', client: '客戶', family: '家人',
  friend: '朋友', coworker: '同事', other: '其他',
}

const APP_RULE_ACTIONS: { value: AppRuleAction; label: string; desc: string }[] = [
  { value: 'always_block', label: '永遠攔截', desc: '不問 AI，直接攔截' },
  { value: 'always_allow', label: '永遠放行', desc: '不問 AI，直接穿透' },
  { value: 'ask_ai', label: 'AI 判斷', desc: '每次用 AI 分析（預設）' },
]

const ACTION_LABELS: Record<AppRuleAction, string> = {
  always_block: '🚫 攔截',
  always_allow: '✅ 放行',
  ask_ai: '🤖 AI',
}

// ── Custom Toggle (avoids Fabric Switch crash) ───────────────────────────

function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const translateX = React.useRef(new Animated.Value(value ? 20 : 0)).current;

  React.useEffect(() => {
    Animated.timing(translateX, {
      toValue: value ? 20 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [value, translateX]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
      style={[toggleStyles.track, value && toggleStyles.trackActive]}>
      <Animated.View
        style={[toggleStyles.thumb, { transform: [{ translateX }] }]}
      />
    </TouchableOpacity>
  );
}

const toggleStyles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4A3828',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  trackActive: {
    backgroundColor: '#FF9F4388',
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF9F43',
  },
});

// ── Component ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [urgentOnlyMode, setUrgentOnlyMode] = useState(true);

  // Whitelist
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [newSenderName, setNewSenderName] = useState('');
  const [newSenderContact, setNewSenderContact] = useState('');
  const [newRelationship, setNewRelationship] = useState<SenderRelationship>('other');

  // App Rules
  const [appRules, setAppRules] = useState<AppRule[]>([]);
  const [newAppName, setNewAppName] = useState('');
  const [newAppAction, setNewAppAction] = useState<AppRuleAction>('always_block');

  // Account management
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePw, setDeletePw] = useState('');

  // Track whether the very first mount has finished so we can safely
  // call setState without racing against Fabric's initial commit.
  const hasMounted = useRef(false);

  // Fetch data on focus — but DEFER on first mount.
  //
  // WHY: On Android Fabric (New Architecture), useFocusEffect fires
  // immediately when the tab screen mounts. If the API responds before
  // Fabric finishes committing the initial view tree, the resulting
  // setState triggers a re-render that conflicts with the in-progress
  // mount → "addViewAt: child already has a parent" crash.
  //
  // FIX: On the very first focus, wait for InteractionManager (which
  // signals that all pending native animations/mount work is done)
  // before fetching. On subsequent focuses (tab switch back), Fabric
  // has already mounted so we can fetch immediately.
  useFocusEffect(
    useCallback(() => {
      const doFetch = () => {
        api.ai.getWhitelist().then(res => setWhitelist(res.whitelist)).catch(() => {});
        api.ai.getAppRules().then(res => setAppRules(res.rules)).catch(() => {});
      };

      if (!hasMounted.current) {
        // First mount: defer until Fabric finishes committing the view tree
        const handle = InteractionManager.runAfterInteractions(() => {
          hasMounted.current = true;
          doFetch();
        });
        return () => handle.cancel();
      }

      // Subsequent focus events: safe to fetch immediately
      doFetch();
    }, [])
  );

  // ── Whitelist handlers ───────────────────────────────────────────────────

  const handleAddWhitelist = async () => {
    const name = newSenderName.trim();
    const contact = newSenderContact.trim() || name;
    if (!name) return;
    try {
      const { entry } = await api.ai.addWhitelist({
        name,
        contact,
        relationship: newRelationship,
      });
      setWhitelist(prev => [...prev, entry]);
      setNewSenderName('');
      setNewSenderContact('');
      setNewRelationship('other');
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

  // ── App Rules handlers ───────────────────────────────────────────────────

  const handleAddAppRule = async () => {
    const appName = newAppName.trim();
    if (!appName) return;
    try {
      const { rule } = await api.ai.addAppRule({
        appName,
        action: newAppAction,
      });
      setAppRules(prev => [...prev, rule]);
      setNewAppName('');
      setNewAppAction('always_block');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRemoveAppRule = async (id: string) => {
    try {
      await api.ai.removeAppRule(id);
      setAppRules(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // ── Account management ──────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!currentPw || newPw.length < 8) {
      Alert.alert('錯誤', '新密碼至少 8 個字元');
      return;
    }
    try {
      await api.auth.changePassword({ currentPassword: currentPw, newPassword: newPw });
      Alert.alert('成功', '密碼已變更，請重新登入');
      setShowChangePassword(false);
      setCurrentPw('');
      setNewPw('');
      signOut();
    } catch (err: any) {
      Alert.alert('錯誤', err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePw) {
      Alert.alert('錯誤', '請輸入密碼');
      return;
    }
    try {
      await api.auth.deleteAccount({ password: deletePw });
      Alert.alert('帳號已刪除', '你的帳號和所有資料已永久刪除');
      signOut();
    } catch (err: any) {
      Alert.alert('錯誤', err.message);
    }
  };

  // ── Sign out ─────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert('登出', '確定要登出嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Account */}
      <Text style={styles.sectionTitle}>帳號</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || '—'}</Text>
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>偏好設定</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>緊急通知穿透</Text>
            <Text style={styles.hint}>允許緊急訊息在專注時穿透</Text>
          </View>
          <Toggle value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>AI 緊急判斷</Text>
            <Text style={styles.hint}>使用 Claude AI 分析訊息緊急度</Text>
          </View>
          <Toggle value={urgentOnlyMode} onValueChange={setUrgentOnlyMode} />
        </View>
      </View>

      {/* Whitelist */}
      <Text style={styles.sectionTitle}>白名單（永遠放行）</Text>
      <View style={styles.card}>
        {/* Name input */}
        <TextInput
          style={styles.addInput}
          placeholder="名稱（如：張經理）"
          placeholderTextColor="#887766"
          value={newSenderName}
          onChangeText={setNewSenderName}
        />
        {/* Contact input */}
        <TextInput
          style={[styles.addInput, { marginTop: 8 }]}
          placeholder="聯絡方式（email 或電話）"
          placeholderTextColor="#887766"
          value={newSenderContact}
          onChangeText={setNewSenderContact}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {/* Relationship chips */}
        <Text style={styles.chipLabel}>關係</Text>
        <View style={styles.chipRow}>
          {RELATIONSHIPS.slice(0, 3).map(r => (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.chip,
                newRelationship === r.value && styles.chipActive,
              ]}
              onPress={() => setNewRelationship(r.value)}>
              <Text
                style={[
                  styles.chipText,
                  newRelationship === r.value && styles.chipTextActive,
                ]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.chipRow}>
          {RELATIONSHIPS.slice(3).map(r => (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.chip,
                newRelationship === r.value && styles.chipActive,
              ]}
              onPress={() => setNewRelationship(r.value)}>
              <Text
                style={[
                  styles.chipText,
                  newRelationship === r.value && styles.chipTextActive,
                ]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Add button */}
        <TouchableOpacity style={styles.addButton} onPress={handleAddWhitelist}>
          <Text style={styles.addButtonText}>新增白名單</Text>
        </TouchableOpacity>

        {/* Existing entries */}
        {whitelist.map(entry => (
          <View key={entry.id} style={styles.whitelistRow}>
            <View style={styles.whitelistInfo}>
              <Text style={styles.whitelistSender}>
                {entry.name}
              </Text>
              <View style={styles.whitelistMeta}>
                <View style={styles.relationBadge}>
                  <Text style={styles.relationBadgeText}>
                    {RELATIONSHIP_LABELS[entry.relationship] || '其他'}
                  </Text>
                </View>
                <Text style={styles.whitelistContact}>{entry.contact}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => handleRemoveWhitelist(entry.id)}>
              <Text style={styles.removeText}>移除</Text>
            </TouchableOpacity>
          </View>
        ))}
        {whitelist.length === 0 && (
          <Text style={styles.emptyText}>尚未設定白名單</Text>
        )}
      </View>

      {/* App Rules */}
      <Text style={styles.sectionTitle}>App 規則</Text>
      <Text style={styles.sectionDesc}>
        為特定 App 設定固定規則，跳過 AI 分析以節省用量
      </Text>
      <View style={styles.card}>
        {/* App name input */}
        <TextInput
          style={styles.addInput}
          placeholder="App 名稱（如：Shopee, Instagram）"
          placeholderTextColor="#887766"
          value={newAppName}
          onChangeText={setNewAppName}
        />
        {/* Action chips */}
        <Text style={styles.chipLabel}>動作</Text>
        <View style={styles.chipRow}>
          {APP_RULE_ACTIONS.map(a => (
            <TouchableOpacity
              key={a.value}
              style={[
                styles.chip,
                newAppAction === a.value && styles.chipActive,
              ]}
              onPress={() => setNewAppAction(a.value)}>
              <Text
                style={[
                  styles.chipText,
                  newAppAction === a.value && styles.chipTextActive,
                ]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Selected action description */}
        <Text style={styles.actionDesc}>
          {APP_RULE_ACTIONS.find(a => a.value === newAppAction)?.desc}
        </Text>
        {/* Add button */}
        <TouchableOpacity style={styles.addButton} onPress={handleAddAppRule}>
          <Text style={styles.addButtonText}>新增規則</Text>
        </TouchableOpacity>

        {/* Existing rules */}
        {appRules.map(rule => (
          <View key={rule.id} style={styles.whitelistRow}>
            <View style={styles.whitelistInfo}>
              <Text style={styles.whitelistSender}>{rule.appName}</Text>
              <View style={styles.whitelistMeta}>
                <View style={[
                  styles.actionBadge,
                  rule.action === 'always_block' && styles.actionBadgeBlock,
                  rule.action === 'always_allow' && styles.actionBadgeAllow,
                  rule.action === 'ask_ai' && styles.actionBadgeAi,
                ]}>
                  <Text style={[
                    styles.actionBadgeText,
                    rule.action === 'always_block' && styles.actionBadgeTextBlock,
                    rule.action === 'always_allow' && styles.actionBadgeTextAllow,
                    rule.action === 'ask_ai' && styles.actionBadgeTextAi,
                  ]}>
                    {ACTION_LABELS[rule.action]}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={() => handleRemoveAppRule(rule.id)}>
              <Text style={styles.removeText}>移除</Text>
            </TouchableOpacity>
          </View>
        ))}
        {appRules.length === 0 && (
          <Text style={styles.emptyText}>尚未設定 App 規則（所有 App 預設使用 AI 判斷）</Text>
        )}
      </View>

      {/* Account Management */}
      <Text style={styles.sectionTitle}>帳號管理</Text>

      {/* Change Password */}
      <View style={styles.card}>
        {!showChangePassword ? (
          <TouchableOpacity onPress={() => setShowChangePassword(true)}>
            <Text style={styles.label}>變更密碼</Text>
            <Text style={styles.hint}>定期變更密碼以保護帳號安全</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              style={styles.addInput}
              placeholder="目前密碼"
              placeholderTextColor="#A89880"
              secureTextEntry
              value={currentPw}
              onChangeText={setCurrentPw}
            />
            <TextInput
              style={[styles.addInput, { marginTop: 8 }]}
              placeholder="新密碼（至少 8 字元）"
              placeholderTextColor="#A89880"
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
            />
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                style={[styles.addButton, { flex: 1 }]}
                onPress={handleChangePassword}>
                <Text style={styles.addButtonText}>確認變更</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addButton, { flex: 1, backgroundColor: '#F5EDE3' }]}
                onPress={() => { setShowChangePassword(false); setCurrentPw(''); setNewPw(''); }}>
                <Text style={[styles.addButtonText, { color: '#7A6652' }]}>取消</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Delete Account */}
      <View style={styles.card}>
        {!showDeleteConfirm ? (
          <TouchableOpacity onPress={() => setShowDeleteConfirm(true)}>
            <Text style={[styles.label, { color: '#DC3545' }]}>刪除帳號</Text>
            <Text style={styles.hint}>永久刪除帳號及所有資料（無法復原）</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={[styles.label, { color: '#DC3545', marginBottom: 8 }]}>確認刪除帳號</Text>
            <Text style={[styles.hint, { marginBottom: 8 }]}>輸入密碼以確認刪除。此操作無法復原。</Text>
            <TextInput
              style={styles.addInput}
              placeholder="輸入密碼確認"
              placeholderTextColor="#A89880"
              secureTextEntry
              value={deletePw}
              onChangeText={setDeletePw}
            />
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                style={[styles.signOutButton, { flex: 1 }]}
                onPress={handleDeleteAccount}>
                <Text style={styles.signOutText}>永久刪除</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addButton, { flex: 1, backgroundColor: '#F5EDE3' }]}
                onPress={() => { setShowDeleteConfirm(false); setDeletePw(''); }}>
                <Text style={[styles.addButtonText, { color: '#7A6652' }]}>取消</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>登出</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.version}>Zen Capsule v1.1.0</Text>
      </View>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

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
  sectionDesc: {
    color: '#AA9080',
    fontSize: 12,
    marginBottom: 8,
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
  addInput: {
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
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: {
    color: '#1A1410',
    fontWeight: '700',
    fontSize: 14,
  },

  // Chip selector
  chipLabel: {
    color: '#AA9080',
    fontSize: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1A1410',
    borderWidth: 1,
    borderColor: '#4A3828',
    margin: 3,
  },
  chipActive: {
    backgroundColor: '#FF9F4322',
    borderColor: '#FF9F43',
  },
  chipText: {
    color: '#887766',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#FF9F43',
    fontWeight: '600',
  },

  // Action description
  actionDesc: {
    color: '#887766',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },

  // Whitelist entries
  whitelistRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#4A3828',
    marginTop: 8,
  },
  whitelistInfo: {
    flex: 1,
    marginRight: 12,
  },
  whitelistSender: {
    color: '#FFF0E0',
    fontSize: 14,
    fontWeight: '500',
  },
  whitelistMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  whitelistContact: {
    color: '#887766',
    fontSize: 12,
    marginLeft: 8,
  },
  relationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#FF9F4322',
  },
  relationBadgeText: {
    color: '#FF9F43',
    fontSize: 11,
    fontWeight: '600',
  },

  // App rule action badges
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  actionBadgeBlock: { backgroundColor: '#FF634822' },
  actionBadgeAllow: { backgroundColor: '#2ECC7122' },
  actionBadgeAi: { backgroundColor: '#FF9F4322' },
  actionBadgeText: { fontSize: 11, fontWeight: '600' },
  actionBadgeTextBlock: { color: '#FF6348' },
  actionBadgeTextAllow: { color: '#2ECC71' },
  actionBadgeTextAi: { color: '#FF9F43' },

  removeText: {
    color: '#FF6348',
    fontSize: 13,
  },
  emptyText: {
    color: '#887766',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 8,
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
