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
import { api } from '../services/api';
import { setFocusMode, setAuthToken, setRefreshToken } from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Request POST_NOTIFICATIONS permission on Android 13+ (API 33) */
async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || (Platform.Version as number) < 33) return true;
  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'Notification Permission',
      message: 'Zen Capsule needs notification access to alert you about urgent messages during focus sessions.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  return status === PermissionsAndroid.RESULTS.GRANTED;
}

const PRESET_DURATIONS = [25, 45, 60, 90]; // minutes
const CUSTOM_KEY = -1;

export default function FocusScreen() {
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [activePreset, setActivePreset] = useState<number>(25); // tracks which button is highlighted
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const customInputRef = useRef<TextInput>(null);

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
      'Focus Complete!',
      `Great job! You stayed focused for ${selectedMinutes} minutes.`,
      [{ text: 'OK' }],
    );
    if (sessionId) {
      api.focus.end({ sessionId }).catch(() => {});
      setSessionId(null);
    }
  }, [selectedMinutes, sessionId]);

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
      Alert.alert('Invalid duration', 'Please enter a number between 1 and 480 minutes.');
      return;
    }
    setSelectedMinutes(parsed);
    setShowCustomInput(false);
  };

  const startFocus = async () => {
    // Request POST_NOTIFICATIONS permission on Android 13+
    await ensureNotificationPermission();

    setRemainingSeconds(selectedMinutes * 60);
    setIsRunning(true);

    // Activate native notification interception
    const token = await AsyncStorage.getItem('zen_capsule_token');
    const refresh = await AsyncStorage.getItem('zen_capsule_refresh');
    if (token) setAuthToken(token);
    if (refresh) setRefreshToken(refresh);
    setFocusMode(true);

    try {
      const { session } = await api.focus.start({ goal: `Focus ${selectedMinutes}min` });
      setSessionId(session.id);
    } catch {
      // Offline mode: still run timer locally
    }
  };

  const stopFocus = () => {
    Alert.alert('End Session?', 'Are you sure you want to stop focusing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
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
          <Text style={styles.progressText}>{Math.round(progress * 100)}% complete</Text>
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
            {/* Custom button */}
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

          {/* Custom input row */}
          {showCustomInput && (
            <View style={styles.customRow}>
              <TextInput
                ref={customInputRef}
                style={styles.customInput}
                placeholder="1–480"
                placeholderTextColor="#887766"
                keyboardType="number-pad"
                maxLength={3}
                value={customInput}
                onChangeText={setCustomInput}
                onSubmitEditing={confirmCustom}
                returnKeyType="done"
              />
              <Text style={styles.customUnit}>min</Text>
              <TouchableOpacity style={styles.customConfirm} onPress={confirmCustom}>
                <Text style={styles.customConfirmText}>Set</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Start / Stop Button */}
      <TouchableOpacity
        style={[styles.mainButton, isRunning && styles.stopButton]}
        onPress={isRunning ? stopFocus : startFocus}>
        <Text style={styles.mainButtonText}>{isRunning ? 'End Session' : 'Start Focus'}</Text>
      </TouchableOpacity>

      {/* Status */}
      <Text style={styles.statusText}>
        {isRunning
          ? '🧘 Digital barrier active — distractions blocked'
          : 'Tap to begin your focus session'}
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  timerCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#2A2018',
    borderWidth: 3,
    borderColor: '#4A3828',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  timerCircleActive: {
    borderColor: '#FF9F43',
    shadowColor: '#FF9F43',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '300',
    color: '#FFF0E0',
    fontVariant: ['tabular-nums'],
  },
  progressText: {
    fontSize: 12,
    color: '#AA9080',
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  presetButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2A2018',
    borderWidth: 1,
    borderColor: '#4A3828',
  },
  presetButtonActive: {
    backgroundColor: '#FF9F4322',
    borderColor: '#FF9F43',
  },
  presetText: {
    color: '#AA9080',
    fontSize: 16,
    fontWeight: '500',
  },
  presetTextActive: {
    color: '#FF9F43',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  customInput: {
    width: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#2A2018',
    borderWidth: 1,
    borderColor: '#FF9F43',
    color: '#FFF0E0',
    fontSize: 18,
    textAlign: 'center',
  },
  customUnit: {
    color: '#AA9080',
    fontSize: 16,
  },
  customConfirm: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FF9F43',
  },
  customConfirmText: {
    color: '#FFF5EB',
    fontWeight: '600',
    fontSize: 15,
  },
  mainButton: {
    backgroundColor: '#FF9F43',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginBottom: 24,
    marginTop: 8,
  },
  stopButton: {
    backgroundColor: '#FF6348',
  },
  mainButtonText: {
    color: '#FFF5EB',
    fontSize: 20,
    fontWeight: '600',
  },
  statusText: {
    color: '#AA9080',
    fontSize: 14,
    textAlign: 'center',
  },
});
