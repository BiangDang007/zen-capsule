import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Alert,
} from 'react-native';
import * as api from '../services/api';

const PRESET_DURATIONS = [25, 45, 60, 90]; // minutes

export default function FocusScreen() {
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation when running
  useEffect(() => {
    if (isRunning) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
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
    if (intervalRef.current) clearInterval(intervalRef.current);
    Vibration.vibrate([0, 500, 200, 500]);
    Alert.alert(
      'Focus Complete! 🎉',
      `Great job! You stayed focused for ${selectedMinutes} minutes.`,
      [{ text: 'OK' }],
    );
    if (sessionId) {
      api.endSession(sessionId).catch(() => {});
      setSessionId(null);
    }
  }, [selectedMinutes, sessionId]);

  const startFocus = async () => {
    setRemainingSeconds(selectedMinutes * 60);
    setIsRunning(true);
    try {
      const session = await api.startSession(selectedMinutes);
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
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (sessionId) {
            api.endSession(sessionId).catch(() => {});
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

  const progress = isRunning
    ? 1 - remainingSeconds / (selectedMinutes * 60)
    : 0;

  return (
    <View style={styles.container}>
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
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}% complete
          </Text>
        )}
      </Animated.View>

      {/* Duration Presets */}
      {!isRunning && (
        <View style={styles.presetRow}>
          {PRESET_DURATIONS.map(min => (
            <TouchableOpacity
              key={min}
              style={[
                styles.presetButton,
                selectedMinutes === min && styles.presetButtonActive,
              ]}
              onPress={() => setSelectedMinutes(min)}>
              <Text
                style={[
                  styles.presetText,
                  selectedMinutes === min && styles.presetTextActive,
                ]}>
                {min}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Start / Stop Button */}
      <TouchableOpacity
        style={[styles.mainButton, isRunning && styles.stopButton]}
        onPress={isRunning ? stopFocus : startFocus}>
        <Text style={styles.mainButtonText}>
          {isRunning ? 'End Session' : 'Start Focus'}
        </Text>
      </TouchableOpacity>

      {/* Status */}
      <Text style={styles.statusText}>
        {isRunning
          ? '🧘 Digital barrier active — distractions blocked'
          : 'Tap to begin your focus session'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  timerCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#1A1A2E',
    borderWidth: 3,
    borderColor: '#2A2A4A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  timerCircleActive: {
    borderColor: '#6C63FF',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '300',
    color: '#E0E0FF',
    fontVariant: ['tabular-nums'],
  },
  progressText: {
    fontSize: 12,
    color: '#8888AA',
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  presetButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  presetButtonActive: {
    backgroundColor: '#6C63FF22',
    borderColor: '#6C63FF',
  },
  presetText: {
    color: '#8888AA',
    fontSize: 16,
    fontWeight: '500',
  },
  presetTextActive: {
    color: '#6C63FF',
  },
  mainButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginBottom: 24,
  },
  stopButton: {
    backgroundColor: '#FF4757',
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  statusText: {
    color: '#8888AA',
    fontSize: 14,
    textAlign: 'center',
  },
});
