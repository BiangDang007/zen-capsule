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
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type {
  WhitelistEntry,
  SenderRelationship,
  AppRule,
  AppRuleAction,
  BillingStatus,
} from '@zen-capsule/shared';

// ── Constants ──────────────────────────────────────────────────────────────

const RELATIONSHIP_KEYS: SenderRelationship[] = ['boss', 'client', 'family', 'friend', 'coworker', 'other'];

const APP_RULE_ACTION_KEYS: AppRuleAction[] = ['always_block', 'always_allow', 'ask_ai'];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ar', label: 'العربية' },
];

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
    backgroundColor: '#E8D5C0',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  trackActive: {
    backgroundColor: '#E8712A55',
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E8712A',
  },
});


// ── Component ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [urgentOnlyMode, setUrgentOnlyMode] = useState(true);

  // Billing / plan
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [upgrading, setUpgrading] = useState(false);

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

  const hasMounted = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const doFetch = () => {
        api.ai.getWhitelist().then(res => setWhitelist(res.whitelist)).catch(() => {});
        api.ai.getAppRules().then(res => setAppRules(res.rules)).catch(() => {});
        api.billing.status().then(setBilling).catch(() => {});
      };

      if (!hasMounted.current) {
        const handle = InteractionManager.runAfterInteractions(() => {
          hasMounted.current = true;
          doFetch();
        });
        return () => handle.cancel();
      }

      doFetch();
    }, [])
  );

  // ── Helpers for i18n lookups ─────────────────────────────────────────────

  const relLabel = (rel: SenderRelationship) => t(`settings.rel.${rel}`);

  const actionLabel = (action: AppRuleAction) => {
    const map: Record<AppRuleAction, string> = {
      always_block: t('settings.alwaysBlock'),
      always_allow: t('settings.alwaysAllow'),
      ask_ai: t('settings.askAi'),
    };
    return map[action];
  };

  const actionDesc = (action: AppRuleAction) => {
    const map: Record<AppRuleAction, string> = {
      always_block: t('settings.alwaysBlockDesc'),
      always_allow: t('settings.alwaysAllowDesc'),
      ask_ai: t('settings.askAiDesc'),
    };
    return map[action];
  };

  const actionBadgeLabel = (action: AppRuleAction) => {
    const map: Record<AppRuleAction, string> = {
      always_block: t('settings.actionBlock'),
      always_allow: t('settings.actionAllow'),
      ask_ai: t('settings.actionAi'),
    };
    return map[action];
  };

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
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleRemoveWhitelist = async (id: string) => {
    try {
      await api.ai.removeWhitelist(id);
      setWhitelist(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
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
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleRemoveAppRule = async (id: string) => {
    try {
      await api.ai.removeAppRule(id);
      setAppRules(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  // ── Billing ──────────────────────────────────────────────────────────────

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      // DEV: flips the account to PRO instantly. In production this button will
      // launch the Google Play / RevenueCat purchase flow instead.
      await api.billing.devUpgrade();
      const status = await api.billing.status();
      setBilling(status);
      Alert.alert('已升級 PRO 🎉', 'AI 智慧穿透已啟用。（測試升級；正式版將透過 Google Play 訂閱付款）');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setUpgrading(false);
    }
  };

  // ── Account management ──────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!currentPw || newPw.length < 8) {
      Alert.alert(t('common.error'), t('settings.newPwMinLength'));
      return;
    }
    try {
      await api.auth.changePassword({ currentPassword: currentPw, newPassword: newPw });
      Alert.alert(t('common.success'), t('settings.passwordChanged'));
      setShowChangePassword(false);
      setCurrentPw('');
      setNewPw('');
      signOut();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePw) {
      Alert.alert(t('common.error'), t('settings.enterPassword'));
      return;
    }
    try {
      await api.auth.deleteAccount({ password: deletePw });
      Alert.alert(t('settings.accountDeleted'), t('settings.accountDeletedMsg'));
      signOut();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  // ── Sign out ─────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert(t('settings.signOut'), t('settings.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: signOut },
    ]);
  };

  // ── Language switcher ────────────────────────────────────────────────────

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Language */}
      <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>{t('settings.languageDesc')}</Text>
        <View style={styles.chipRow}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.chip,
                i18n.language === lang.code && styles.chipActive,
              ]}
              onPress={() => changeLanguage(lang.code)}>
              <Text
                style={[
                  styles.chipText,
                  i18n.language === lang.code && styles.chipTextActive,
                ]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Account */}
      <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t('common.email')}</Text>
        <Text style={styles.value}>{user?.email || '—'}</Text>
      </View>

      {/* Plan / Billing */}
      <Text style={styles.sectionTitle}>方案</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>
              {billing?.plan === 'PRO' ? '✨ Zen Capsule PRO' : '免費版'}
            </Text>
            <Text style={styles.hint}>
              {billing?.plan === 'PRO'
                ? `AI 智慧穿透已啟用${billing.planExpiresAt ? ` · 到期 ${new Date(billing.planExpiresAt).toLocaleDateString()}` : ''}`
                : '免費版僅用端上關鍵字 / 規則封鎖。升級 PRO 解鎖 AI 智慧穿透與每 10 分鐘批次摘要。'}
            </Text>
            {billing && (
              <Text style={styles.hint}>
                今日 AI 用量：{billing.today.analyses.used}/{billing.today.analyses.limit}
              </Text>
            )}
          </View>
          {billing?.plan === 'PRO' && (
            <View style={styles.relationBadge}>
              <Text style={styles.relationBadgeText}>PRO</Text>
            </View>
          )}
        </View>
        {billing?.plan !== 'PRO' && (
          <TouchableOpacity
            style={[styles.addButton, upgrading && { opacity: 0.6 }]}
            disabled={upgrading}
            onPress={handleUpgrade}>
            <Text style={styles.addButtonText}>
              {upgrading ? '升級中…' : '升級 PRO（$4.99 / 月）'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>{t('settings.breakthroughNotif')}</Text>
            <Text style={styles.hint}>{t('settings.breakthroughNotifDesc')}</Text>
          </View>
          <Toggle value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>{t('settings.aiUrgency')}</Text>
            <Text style={styles.hint}>{t('settings.aiUrgencyDesc')}</Text>
          </View>
          <Toggle value={urgentOnlyMode} onValueChange={setUrgentOnlyMode} />
        </View>
      </View>

      {/* Whitelist */}
      <Text style={styles.sectionTitle}>{t('settings.whitelist')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.addInput}
          placeholder={t('settings.whitelistName')}
          placeholderTextColor="#A89880"
          value={newSenderName}
          onChangeText={setNewSenderName}
        />
        <TextInput
          style={[styles.addInput, { marginTop: 8 }]}
          placeholder={t('settings.whitelistContact')}
          placeholderTextColor="#A89880"
          value={newSenderContact}
          onChangeText={setNewSenderContact}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.chipLabel}>{t('settings.relationship')}</Text>
        <View style={styles.chipRow}>
          {RELATIONSHIP_KEYS.slice(0, 3).map(rel => (
            <TouchableOpacity
              key={rel}
              style={[styles.chip, newRelationship === rel && styles.chipActive]}
              onPress={() => setNewRelationship(rel)}>
              <Text style={[styles.chipText, newRelationship === rel && styles.chipTextActive]}>
                {relLabel(rel)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.chipRow}>
          {RELATIONSHIP_KEYS.slice(3).map(rel => (
            <TouchableOpacity
              key={rel}
              style={[styles.chip, newRelationship === rel && styles.chipActive]}
              onPress={() => setNewRelationship(rel)}>
              <Text style={[styles.chipText, newRelationship === rel && styles.chipTextActive]}>
                {relLabel(rel)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddWhitelist}>
          <Text style={styles.addButtonText}>{t('settings.addWhitelist')}</Text>
        </TouchableOpacity>

        {whitelist.map(entry => (
          <View key={entry.id} style={styles.whitelistRow}>
            <View style={styles.whitelistInfo}>
              <Text style={styles.whitelistSender}>{entry.name}</Text>
              <View style={styles.whitelistMeta}>
                <View style={styles.relationBadge}>
                  <Text style={styles.relationBadgeText}>
                    {relLabel(entry.relationship)}
                  </Text>
                </View>
                <Text style={styles.whitelistContact}>{entry.contact}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => handleRemoveWhitelist(entry.id)}>
              <Text style={styles.removeText}>{t('common.remove')}</Text>
            </TouchableOpacity>
          </View>
        ))}
        {whitelist.length === 0 && (
          <Text style={styles.emptyText}>{t('settings.noWhitelist')}</Text>
        )}
      </View>

      {/* App Rules */}
      <Text style={styles.sectionTitle}>{t('settings.appRules')}</Text>
      <Text style={styles.sectionDesc}>{t('settings.appRulesDesc')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.addInput}
          placeholder={t('settings.appName')}
          placeholderTextColor="#A89880"
          value={newAppName}
          onChangeText={setNewAppName}
        />
        <Text style={styles.chipLabel}>{t('settings.action')}</Text>
        <View style={styles.chipRow}>
          {APP_RULE_ACTION_KEYS.map(a => (
            <TouchableOpacity
              key={a}
              style={[styles.chip, newAppAction === a && styles.chipActive]}
              onPress={() => setNewAppAction(a)}>
              <Text style={[styles.chipText, newAppAction === a && styles.chipTextActive]}>
                {actionLabel(a)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.actionDescText}>{actionDesc(newAppAction)}</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAddAppRule}>
          <Text style={styles.addButtonText}>{t('settings.addRule')}</Text>
        </TouchableOpacity>

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
                    {actionBadgeLabel(rule.action)}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={() => handleRemoveAppRule(rule.id)}>
              <Text style={styles.removeText}>{t('common.remove')}</Text>
            </TouchableOpacity>
          </View>
        ))}
        {appRules.length === 0 && (
          <Text style={styles.emptyText}>{t('settings.noAppRules')}</Text>
        )}
      </View>

      {/* Account Management */}
      <Text style={styles.sectionTitle}>{t('settings.accountMgmt')}</Text>

      {/* Change Password */}
      <View style={styles.card}>
        {!showChangePassword ? (
          <TouchableOpacity onPress={() => setShowChangePassword(true)}>
            <Text style={styles.label}>{t('settings.changePassword')}</Text>
            <Text style={styles.hint}>{t('settings.changePasswordDesc')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              style={styles.addInput}
              placeholder={t('settings.currentPassword')}
              placeholderTextColor="#A89880"
              secureTextEntry
              value={currentPw}
              onChangeText={setCurrentPw}
            />
            <TextInput
              style={[styles.addInput, { marginTop: 8 }]}
              placeholder={t('settings.newPassword')}
              placeholderTextColor="#A89880"
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
            />
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                style={[styles.addButton, { flex: 1 }]}
                onPress={handleChangePassword}>
                <Text style={styles.addButtonText}>{t('settings.confirmChange')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addButton, { flex: 1, backgroundColor: '#F5EDE3' }]}
                onPress={() => { setShowChangePassword(false); setCurrentPw(''); setNewPw(''); }}>
                <Text style={[styles.addButtonText, { color: '#7A6652' }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Delete Account */}
      <View style={styles.card}>
        {!showDeleteConfirm ? (
          <TouchableOpacity onPress={() => setShowDeleteConfirm(true)}>
            <Text style={[styles.label, { color: '#DC3545' }]}>{t('settings.deleteAccount')}</Text>
            <Text style={styles.hint}>{t('settings.deleteAccountDesc')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={[styles.label, { color: '#DC3545', marginBottom: 8 }]}>{t('settings.confirmDelete')}</Text>
            <Text style={[styles.hint, { marginBottom: 8 }]}>{t('settings.confirmDeleteDesc')}</Text>
            <TextInput
              style={styles.addInput}
              placeholder={t('settings.enterPwConfirm')}
              placeholderTextColor="#A89880"
              secureTextEntry
              value={deletePw}
              onChangeText={setDeletePw}
            />
            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                style={[styles.signOutButton, { flex: 1 }]}
                onPress={handleDeleteAccount}>
                <Text style={styles.signOutText}>{t('settings.deletePermanently')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addButton, { flex: 1, backgroundColor: '#F5EDE3' }]}
                onPress={() => { setShowDeleteConfirm(false); setDeletePw(''); }}>
                <Text style={[styles.addButtonText, { color: '#7A6652' }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
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
    backgroundColor: '#FFF5EB',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    color: '#E8712A',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 24,
  },
  sectionDesc: {
    color: '#7A6652',
    fontSize: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFF0E0',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8D5C0',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flex: 1,
    marginEnd: 12,
  },
  label: {
    color: '#2D1B0E',
    fontSize: 16,
  },
  value: {
    color: '#7A6652',
    fontSize: 14,
    marginTop: 4,
  },
  hint: {
    color: '#A89880',
    fontSize: 12,
    marginTop: 2,
  },
  addInput: {
    backgroundColor: '#FFF5EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2D1B0E',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#E8712A',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // Chip selector
  chipLabel: {
    color: '#7A6652',
    fontSize: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFF5EB',
    borderWidth: 1,
    borderColor: '#E8D5C0',
    margin: 3,
  },
  chipActive: {
    backgroundColor: '#E8712A18',
    borderColor: '#E8712A',
  },
  chipText: {
    color: '#A89880',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#E8712A',
    fontWeight: '600',
  },

  // Action description
  actionDescText: {
    color: '#A89880',
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
    borderTopColor: '#E8D5C0',
    marginTop: 8,
  },
  whitelistInfo: {
    flex: 1,
    marginEnd: 12,
  },
  whitelistSender: {
    color: '#2D1B0E',
    fontSize: 14,
    fontWeight: '500',
  },
  whitelistMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  whitelistContact: {
    color: '#A89880',
    fontSize: 12,
    marginStart: 8,
  },
  relationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#E8712A18',
  },
  relationBadgeText: {
    color: '#E8712A',
    fontSize: 11,
    fontWeight: '600',
  },

  // App rule action badges
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  actionBadgeBlock: { backgroundColor: '#DC354518' },
  actionBadgeAllow: { backgroundColor: '#28A74518' },
  actionBadgeAi: { backgroundColor: '#E8712A18' },
  actionBadgeText: { fontSize: 11, fontWeight: '600' },
  actionBadgeTextBlock: { color: '#DC3545' },
  actionBadgeTextAllow: { color: '#28A745' },
  actionBadgeTextAi: { color: '#E8712A' },

  removeText: {
    color: '#DC3545',
    fontSize: 13,
  },
  emptyText: {
    color: '#A89880',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 8,
  },
  signOutButton: {
    marginTop: 32,
    backgroundColor: '#DC354518',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DC354530',
  },
  signOutText: {
    color: '#DC3545',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  version: {
    color: '#C4B098',
    fontSize: 12,
  },
});
