/**
 * Zen Capsule — Notification Service (Android only)
 *
 * Bridge to the native Kotlin NotificationListenerService.
 * Provides content-level AI filtering for ALL app notifications.
 *
 * This is the killer feature of Android:
 * - Messenger message from boss about server crash → BREAKTHROUGH
 * - Instagram like notification → BLOCKED, saved for summary
 * - Gmail from client marked urgent → BREAKTHROUGH
 * - TikTok "trending video" → BLOCKED
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ZenNotificationModule } = NativeModules;

interface InterceptedNotification {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  timestamp: number;
  isUrgent: boolean;
  urgencyScore: number;
  urgencyReason: string;
}

interface BreakthroughEvent {
  appName: string;
  title: string;
  text: string;
  urgencyScore: number;
  urgencyReason: string;
}

// Only works on Android
const isAndroid = Platform.OS === 'android';

/**
 * Check if notification listener permission is granted
 */
export async function isPermissionGranted(): Promise<boolean> {
  if (!isAndroid) return false;
  return ZenNotificationModule.isPermissionGranted();
}

/**
 * Open system settings to grant notification access
 */
export function requestPermission(): void {
  if (!isAndroid) return;
  ZenNotificationModule.requestPermission();
}

/**
 * Enable/disable focus mode (starts/stops notification interception)
 */
export function setFocusMode(active: boolean): void {
  if (!isAndroid) return;
  ZenNotificationModule.setFocusMode(active);
}

/**
 * Set auth token for AI analysis API calls
 */
export function setAuthToken(token: string | null): void {
  if (!isAndroid) return;
  ZenNotificationModule.setAuthToken(token);
}

/**
 * Get all intercepted notifications
 */
export async function getInterceptedNotifications(): Promise<InterceptedNotification[]> {
  if (!isAndroid) return [];
  return ZenNotificationModule.getInterceptedNotifications();
}

/**
 * Clear intercepted notifications
 */
export function clearInterceptedNotifications(): void {
  if (!isAndroid) return;
  ZenNotificationModule.clearInterceptedNotifications();
}

/**
 * Get count of intercepted notifications
 */
export async function getInterceptedCount(): Promise<number> {
  if (!isAndroid) return 0;
  return ZenNotificationModule.getInterceptedCount();
}

/**
 * Subscribe to real-time notification events
 */
export function onNotificationIntercepted(
  callback: (notif: InterceptedNotification) => void,
): () => void {
  if (!isAndroid) return () => {};

  const emitter = new NativeEventEmitter(ZenNotificationModule);
  const subscription = emitter.addListener('onNotificationIntercepted', callback);
  return () => subscription.remove();
}

/**
 * Subscribe to breakthrough events (urgent messages)
 */
export function onBreakthrough(
  callback: (event: BreakthroughEvent) => void,
): () => void {
  if (!isAndroid) return () => {};

  const emitter = new NativeEventEmitter(ZenNotificationModule);
  const subscription = emitter.addListener('onBreakthrough', callback);
  return () => subscription.remove();
}
