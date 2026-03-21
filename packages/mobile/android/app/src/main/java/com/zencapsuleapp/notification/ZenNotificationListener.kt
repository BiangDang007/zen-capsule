package com.zencapsuleapp.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Zen Capsule — Android Notification Listener
 *
 * Intercepts ALL incoming notifications from ANY app, sends them to the
 * backend AI for urgency analysis, and decides:
 *   1. Block  → store for break-time summary
 *   2. Through → show a breakthrough notification
 *
 * This is only possible on Android (NotificationListenerService).
 */
class ZenNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "ZenNotificationListener"
        private const val CHANNEL_ID = "zen_breakthrough"
        private val API_BASE: String
            get() = if (com.zencapsuleapp.BuildConfig.DEBUG) {
                "http://10.0.2.2:3001/api/v1"
            } else {
                "https://api.zencapsule.com/api/v1"
            }

        // System / own packages that must never be intercepted
        private val SKIP_PACKAGES = setOf(
            "com.zencapsuleapp",          // ourselves
            "android",
            "com.android.systemui",
            "com.android.system",
            "com.google.android.googlequicksearchbox",
        )

        // Package prefix patterns to skip (system internals)
        // NOTE: do NOT use broad "com.android." — it blocks com.android.shell (adb test notifications)
        private val SKIP_PREFIXES = listOf(
            "com.google.android.gms",
            "com.google.android.gsf",
        )

        // Urgent keywords (local pre-check, no API needed)
        // NOTE: Use specific terms — avoid single chars like "火" that match "火鍋", "火車"
        val URGENT_KEYWORDS = listOf(
            "急", "緊急", "掛掉", "壞掉", "立刻", "馬上",
            "失火", "火災", "修", "趕快", "出問題", "異常",
            "crash", "down", "urgent", "asap", "emergency",
            "critical", "outage", "incident"
        )

        // State shared with ZenNotificationModule (React Native bridge)
        var isFocusing = false
            set(value) {
                field = value
                if (value) {
                    // New session: clear tracking from previous session
                    synchronized(interceptedNotifications) {
                        interceptedNotifications.clear()
                    }
                    synchronized(senderCounts) {
                        senderCounts.clear()
                    }
                }
            }
        var authToken: String? = null
        var refreshToken: String? = null
        var interceptedNotifications = mutableListOf<InterceptedNotification>()
        var onNotificationIntercepted: ((InterceptedNotification) -> Unit)? = null
        var onBreakthroughTriggered: ((InterceptedNotification) -> Unit)? = null

        // Track sender message counts within a session (for repeat detection)
        private val senderCounts = HashMap<String, Int>()

        // Atomic counter for unique notification IDs (avoids timestamp truncation)
        private val notificationIdCounter = AtomicInteger(0)
    }

    // Bounded thread pool instead of unbounded Thread per notification
    private val executor = Executors.newFixedThreadPool(3)

    data class InterceptedNotification(
        val packageName: String,
        val appName: String,
        val title: String,
        val text: String,
        val timestamp: Long,
        val isUrgent: Boolean = false,
        val urgencyScore: Int = 0,
        val urgencyReason: String = ""
    )

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.d(TAG, "ZenNotificationListener created — monitoring ALL apps")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!isFocusing) return

        val packageName = sbn.packageName

        // Skip system and self notifications
        if (packageName in SKIP_PACKAGES) return
        if (SKIP_PREFIXES.any { packageName.startsWith(it) }) return

        // Extract content — try BIG_TEXT first for richer data
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
            ?: "")

        // Skip empty / silent notifications
        if (title.isEmpty() && text.isEmpty()) return

        val appName = resolveAppName(packageName)

        // For messaging apps, title is usually the sender name (e.g., "老闆", "Mom")
        // Use title as senderName; appName stays as the app label (e.g., "LINE")
        val senderName = if (title.isNotEmpty()) title else appName

        // Track repeat messages per sender within this session
        val senderKey = "$senderName@$packageName"
        val repeatCount: Int
        synchronized(senderCounts) {
            val current = senderCounts.getOrDefault(senderKey, 0) + 1
            senderCounts[senderKey] = current
            repeatCount = current
        }

        Log.d(TAG, "Intercepted [$appName] $title — $text (sender=$senderName, repeat=$repeatCount)")

        val notification = InterceptedNotification(
            packageName = packageName,
            appName = appName,
            title = title,
            text = text,
            timestamp = System.currentTimeMillis()
        )

        // Block the original immediately
        cancelNotification(sbn.key)

        executor.execute {
            val urgencyResult = checkUrgency(
                title, text, appName, packageName, senderName, repeatCount
            )

            val updated = notification.copy(
                isUrgent = urgencyResult.isUrgent,
                urgencyScore = urgencyResult.score,
                urgencyReason = urgencyResult.reason
            )

            synchronized(interceptedNotifications) {
                interceptedNotifications.add(updated)
                if (interceptedNotifications.size > 200) {
                    interceptedNotifications.removeAt(0)
                }
            }

            onNotificationIntercepted?.invoke(updated)

            if (urgencyResult.isUrgent) {
                showBreakthroughNotification(updated)
                onBreakthroughTriggered?.invoke(updated)
                Log.d(TAG, "🚨 BREAKTHROUGH [$appName] ${urgencyResult.score}pt — $title")
            } else {
                Log.d(TAG, "🛡 Blocked [$appName] ${urgencyResult.score}pt — $title")
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) { /* no-op */ }

    // ── Urgency Check (2-phase: local keyword → AI) ───────────────────────────

    data class UrgencyResult(val isUrgent: Boolean, val score: Int, val reason: String)

    private fun checkUrgency(
        title: String, text: String, appName: String,
        packageName: String, senderName: String, repeatCount: Int
    ): UrgencyResult {
        val combined = "$title $text".lowercase()

        // Phase 1: instant keyword check
        for (kw in URGENT_KEYWORDS) {
            if (combined.contains(kw.lowercase())) {
                return UrgencyResult(true, 90, "Keyword match: $kw")
            }
        }

        // Phase 2: Claude AI (with 401 retry)
        val token = authToken ?: return UrgencyResult(false, 0, "No auth token")

        return try {
            doAnalyseRequest(token, title, text, appName, packageName, senderName, repeatCount)
        } catch (e: TokenExpiredException) {
            // Attempt token refresh and retry once
            Log.w(TAG, "Token expired, attempting refresh...")
            val newToken = refreshAccessToken()
            if (newToken != null) {
                authToken = newToken
                try {
                    doAnalyseRequest(newToken, title, text, appName, packageName, senderName, repeatCount)
                } catch (e2: Exception) {
                    Log.w(TAG, "AI analysis failed after refresh: ${e2.message}")
                    UrgencyResult(false, 0, "AI unavailable after refresh")
                }
            } else {
                Log.w(TAG, "Token refresh failed")
                UrgencyResult(false, 0, "Token refresh failed")
            }
        } catch (e: Exception) {
            Log.w(TAG, "AI analysis failed: ${e.message}")
            UrgencyResult(false, 0, "AI unavailable")
        }
    }

    /** Custom exception for 401 responses */
    private class TokenExpiredException : Exception("Access token expired")

    private fun doAnalyseRequest(
        token: String, title: String, text: String, appName: String,
        packageName: String, senderName: String, repeatCount: Int
    ): UrgencyResult {
        val url = URL("$API_BASE/ai/analyse")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.connectTimeout = 3000
        conn.readTimeout = 5000
        conn.doOutput = true

        val body = JSONObject().apply {
            put("content", if (title.isNotEmpty()) "$title: $text" else text)
            put("senderName", senderName)        // actual sender (notification title)
            put("senderContact", senderName)     // for whitelist matching
            put("subject", title)
            put("preview", text)
            put("appName", appName)              // app label (e.g., "LINE")
            put("packageName", packageName)
            put("repeatCount", repeatCount)      // sender repeat count this session
        }

        conn.outputStream.bufferedWriter().use { it.write(body.toString()) }

        val responseCode = conn.responseCode
        if (responseCode == 401) {
            conn.disconnect()
            throw TokenExpiredException()
        }

        if (responseCode !in 200..299) {
            val errorBody = try { conn.errorStream?.bufferedReader()?.readText() } catch (_: Exception) { null }
            Log.w(TAG, "AI API returned $responseCode: $errorBody")
            conn.disconnect()
            return UrgencyResult(false, 0, "API error: $responseCode")
        }

        val response = conn.inputStream.bufferedReader().readText()
        conn.disconnect()
        val json = JSONObject(response)
        val result = json.getJSONObject("result")

        return UrgencyResult(
            isUrgent = result.optBoolean("shouldBreakthrough", false),
            score    = result.optInt("score", 0),
            reason   = result.optString("reason", "AI analysis")
        )
    }

    /**
     * Refresh the access token using the stored refresh token.
     * Returns the new access token, or null if refresh failed.
     */
    private fun refreshAccessToken(): String? {
        val rToken = refreshToken ?: return null

        return try {
            val refreshUrl = URL("${API_BASE.substringBeforeLast("/api/v1")}/api/v1/auth/refresh")
            val conn = refreshUrl.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = 3000
            conn.readTimeout = 5000
            conn.doOutput = true

            val body = JSONObject().apply { put("refreshToken", rToken) }
            conn.outputStream.bufferedWriter().use { it.write(body.toString()) }

            if (conn.responseCode == 200) {
                val response = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                val json = JSONObject(response)
                val newAccessToken = json.getString("accessToken")
                val newRefreshToken = json.getString("refreshToken")
                refreshToken = newRefreshToken
                Log.d(TAG, "Token refreshed successfully")
                newAccessToken
            } else {
                conn.disconnect()
                Log.w(TAG, "Token refresh returned ${conn.responseCode}")
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Token refresh error: ${e.message}")
            null
        }
    }

    // ── Breakthrough Notification ──────────────────────────────────────────────

    private fun showBreakthroughNotification(notif: InterceptedNotification) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val n = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("⚡ ${notif.appName}")
            .setContentText(if (notif.title.isNotEmpty()) "${notif.title}: ${notif.text}" else notif.text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        // Use atomic counter to avoid ID collisions from timestamp truncation
        manager.notify(notificationIdCounter.incrementAndGet(), n)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Zen Capsule Breakthrough",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = "Urgent messages that break through focus mode" }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun resolveAppName(packageName: String): String {
        return try {
            val info = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(info).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            // Fallback: strip prefix and capitalise
            packageName.substringAfterLast('.').replaceFirstChar { it.uppercase() }
        }
    }
}
