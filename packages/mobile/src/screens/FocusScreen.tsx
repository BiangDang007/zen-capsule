import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  Vibration,
  Alert,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { api, tryRefreshToken } from '../services/api';
import { setFocusMode, setAuthToken, setRefreshToken } from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRESET_DURATIONS = [25, 45, 60, 90]; // minutes
const CUSTOM_KEY = -1;

export default function FocusScreen() {
  const { t } = useTranslation();
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [activePreset, setActivePreset] = useState<number>(25);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const customInputRef = useRef<TextInput>(null);

  /** Request POST_NOTIFICATIONS permission on Android 13+ (API 33) */
  const ensureNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || (Platform.Version as number) < 33) return true;
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: t('focus.notifPermTitle'),
        message: t('focus.notifPermMsg'),
        buttonPositive: t('focus.allow'),
        buttonNegative: t('focus.deny'),
      },
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  }, [t]);

  // Pulse animation when running
  useEffect(() => {
    if (isRunning) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning, pulseAnim]);

  // Recover orphaned sessions on mount
  useFocusEffect(
    useCallback(() => {
      if (!isRunning) {
        api.focus.history(1, 0).then(res => {
          const latest = res.sessions?.[0];
          if (latest && !latest.endedAt) {
            api.focus.end({ sessionId: latest.id }).catch(() => {});
          }
        }).catch(() => {});
      }
    }, [isRunning])
  );

  // Countdown timer
  useEffect(() => {
    if (isRunning && remainingSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            handleSessionComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSessionComplete = useCallback(() => {
    setIsRunning(false);
    setFocusMode(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    Vibration.vibrate([0, 500, 200, 500]);
    Alert.alert(
      t('focus.focusComplete'),
      t('focus.focusCompleteMsg', { minutes: selectedMinutes }),
      [{ text: t('common.ok') }],
    );
    if (sessionId) {
      api.focus.end({ sessionId }).catch(() => {});
      setSessionId(null);
    }
  }, [selectedMinutes, sessionId, t]);

  const selectPreset = (min: number) => {
    setActivePreset(min);
    setSelectedMinutes(min);
    setShowCustomInput(false);
    setCustomInput('');
  };

  const selectCustom = () => {
    setActivePreset(CUSTOM_KEY);
    setShowCustomInput(true);
    setTimeout(() => customInputRef.current?.focus(), 100);
  };

  const confirmCustom = () => {
    const parsed = parseInt(customInput, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 480) {
      Alert.alert(t('focus.invalidDuration'), t('focus.invalidDurationMsg'));
      return;
    }
    setSelectedMinutes(parsed);
    setShowCustomInput(false);
  };

  const startFocus = async () => {
    await ensureNotificationPermission();

    setRemainingSeconds(selectedMinutes * 60);
    setIsRunning(true);

    let newSessionId: string | null = null;
    try {
      const { session } = await api.focus.start({ goal: `Focus ${selectedMinutes}min` });
      newSessionId = session.id;
      setSessionId(session.id);
    } catch {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        try {
          const { session } = await api.focus.start({ goal: `Focus ${selectedMinutes}min` });
          newSessionId = session.id;
          setSessionId(session.id);
        } catch {
          // Offline mode
        }
      }
    }

    const token = await AsyncStorage.getItem('zen_capsule_token');
    const refresh = await AsyncStorage.getItem('zen_capsule_refresh');
    if (token) setAuthToken(token);
    if (refresh) setRefreshToken(refresh);
    setFocusMode(true);
  };

  const stopFocus = () => {
    Alert.alert(t('focus.endSessionTitle'), t('focus.endSessionMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('focus.stop'),
        style: 'destructive',
        onPress: () => {
          setIsRunning(false);
          setFocusMode(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (sessionId) {
            api.focus.end({ sessionId }).catch(() => {});
            setSessionId(null);
          }
        },
      },
    ]);
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = isRunning ? 1 - remainingSeconds / (selectedMinutes * 60) : 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Timer Circle */}
      <Animated.View
        style={[
          styles.timerCircle,
          { transform: [{ scale: pulseAnim }] },
          isRunning && styles.timerCircleActive,
        ]}>
        <Text style={styles.timerText}>
          {isRunning ? formatTime(remainingSeconds) : formatTime(selectedMinutes * 60)}
        </Text>
        {isRunning && (
          <Text style={styles.progressText}>{Math.round(progress * 100)}{t('focus.complete')}</Text>
        )}
      </Animated.View>

      {/* Duration Selector */}
      {!isRunning && (
        <>
          <View style={styles.presetRow}>
            {PRESET_DURATIONS.map(min => (
              <TouchableOpacity
                key={min}
                style={[styles.presetButton, activePreset === min && styles.presetButtonActive]}
                onPress={() => selectPreset(min)}>
                <Text style={[styles.presetText, activePreset === min && styles.presetTextActive]}>
                  {min}m
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetButton, activePreset === CUSTOM_KEY && styles.presetButtonActive]}
              onPress={selectCustom}>
              <Text style={[styles.presetText, activePreset === CUSTOM_KEY && styles.presetTextActive]}>
                {activePreset === CUSTOM_KEY && selectedMinutes !== 25
                  ? `${selectedMinutes}m`
                  : '...'}
              </Text>
            </TouchableOpacity>
          </View>

          {showCustomInput && (
            <View style={styles.customRow}>
              <TextInput
                ref={customInputRef}
                style={styles.customInput}
                placeholder="1–480"
                placeholderTextColor="#A89880"
                keyboardType="number-pad"
                maxLength={3}
                value={customInput}
                onChangeText={setCustomInput}
                onSubmitEditing={confirmCustom}
                returnKeyType="done"
              />
              <Text style={styles.customUnit}>{t('focus.min')}</Text>
              <TouchableOpacity style={styles.customConfirm} onPress={confirmCustom}>
                <Text style={styles.customConfirmText}>{t('focus.set')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Start / Stop Button */}
      <TouchableOpacity
        style={[styles.mainButton, isRunning && styles.stopButton]}
        onPress={isRunning ? stopFocus : startFocus}>
        <Text style={styles.mainButtonText}>{isRunning ? t('focus.endSession') : t('focus.startFocus')}</Text>
      </TouchableOpacity>

      {/* Status */}
      <Text style={styles.statusText}>
        {isRunning ? t('focus.statusActive') : t('focus.statusIdle')}
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  timerCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#FFF0E0',
    borderWidth: 3,
    borderColor: '#E8D5C0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  timerCircleActive: {
    borderColor: '#E8712A',
    shadowColor: '#E8712A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '300',
    color: '#2D1B0E',
    fontVariant: ['tabular-nums'],
  },
  progressText: {
    fontSize: 12,
    color: '#7A6652',
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'center',
  },
  presetButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFF0E0',
    borderWidth: 1,
    borderColor: '#E8D5C0',
    margin: 5,
  },
  presetButtonActive: {
    backgroundColor: '#E8712A18',
    borderColor: '#E8712A',
  },
  presetText: {
    color: '#7A6652',
    fontSize: 16,
    fontWeight: '500',
  },
  presetTextActive: {
    color: '#E8712A',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  customInput: {
    width: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFF0E0',
    borderWidth: 1,
    borderColor: '#E8712A',
    color: '#2D1B0E',
    fontSize: 18,
    textAlign: 'center',
  },
  customUnit: {
    color: '#7A6652',
    fontSize: 16,
    marginHorizontal: 8,
  },
  customConfirm: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#E8712A',
  },
  customConfirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  mainButton: {
    backgroundColor: '#E8712A',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginBottom: 24,
    marginTop: 8,
  },
  stopButton: {
    backgroundColor: '#DC3545',
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  statusText: {
    color: '#7A6652',
    fontSize: 14,
    textAlign: 'center',
  },
});
