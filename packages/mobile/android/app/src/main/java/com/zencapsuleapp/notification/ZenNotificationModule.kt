package com.zencapsuleapp.notification

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Zen Capsule — React Native Bridge Module
 *
 * Connects the Kotlin NotificationListenerService to React Native JS.
 * Allows JS to:
 *   - Start/stop focus mode
 *   - Set auth token
 *   - Get intercepted notifications
 *   - Receive real-time events (notification intercepted, breakthrough)
 */
class ZenNotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "ZenNotificationModule"

    /**
     * Check if notification listener permission is granted
     */
    @ReactMethod
    fun isPermissionGranted(promise: Promise) {
        val cn = ComponentName(reactApplicationContext, ZenNotificationListener::class.java)
        val flat = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            "enabled_notification_listeners"
        )
        val granted = flat != null && flat.contains(cn.flattenToString())
        promise.resolve(granted)
    }

    /**
     * Open system settings to grant notification access
     */
    @ReactMethod
    fun requestPermission() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }

    /**
     * Set focus mode on/off
     */
    @ReactMethod
    fun setFocusMode(active: Boolean) {
        ZenNotificationListener.isFocusing = active
        if (!active) {
            // When focus ends, stop intercepting
            ZenNotificationListener.isFocusing = false
        }
    }

    /**
     * Set auth token for API calls
     */
    @ReactMethod
    fun setAuthToken(token: String?) {
        ZenNotificationListener.authToken = token
    }

    /**
     * Set refresh token for auto-refreshing expired access tokens during long sessions
     */
    @ReactMethod
    fun setRefreshToken(token: String?) {
        ZenNotificationListener.refreshToken = token
    }

    /**
     * Required by NativeEventEmitter on Android (RN 0.65+)
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // No-op: managed by RCTDeviceEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // No-op: managed by RCTDeviceEventEmitter
    }

    /**
     * Get all intercepted notifications as JSON array
     */
    @ReactMethod
    fun getInterceptedNotifications(promise: Promise) {
        val result = Arguments.createArray()
        synchronized(ZenNotificationListener.interceptedNotifications) {
            for (notif in ZenNotificationListener.interceptedNotifications) {
                val map = Arguments.createMap().apply {
                    putString("packageName", notif.packageName)
                    putString("appName", notif.appName)
                    putString("title", notif.title)
                    putString("text", notif.text)
                    putDouble("timestamp", notif.timestamp.toDouble())
                    putBoolean("isUrgent", notif.isUrgent)
                    putInt("urgencyScore", notif.urgencyScore)
                    putString("urgencyReason", notif.urgencyReason)
                }
                result.pushMap(map)
            }
        }
        promise.resolve(result)
    }

    /**
     * Clear intercepted notifications
     */
    @ReactMethod
    fun clearInterceptedNotifications() {
        synchronized(ZenNotificationListener.interceptedNotifications) {
            ZenNotificationListener.interceptedNotifications.clear()
        }
    }

    /**
     * Get count of intercepted notifications
     */
    @ReactMethod
    fun getInterceptedCount(promise: Promise) {
        promise.resolve(ZenNotificationListener.interceptedNotifications.size)
    }

    // ─── Event Emitter Setup ─────────────────────────────

    override fun initialize() {
        super.initialize()

        // Listen for intercepted notifications → emit to JS
        ZenNotificationListener.onNotificationIntercepted = { notif ->
            sendEvent("onNotificationIntercepted", Arguments.createMap().apply {
                putString("appName", notif.appName)
                putString("title", notif.title)
                putString("text", notif.text)
                putBoolean("isUrgent", notif.isUrgent)
                putInt("urgencyScore", notif.urgencyScore)
            })
        }

        // Listen for breakthroughs → emit to JS
        ZenNotificationListener.onBreakthroughTriggered = { notif ->
            sendEvent("onBreakthrough", Arguments.createMap().apply {
                putString("appName", notif.appName)
                putString("title", notif.title)
                putString("text", notif.text)
                putInt("urgencyScore", notif.urgencyScore)
                putString("urgencyReason", notif.urgencyReason)
            })
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
