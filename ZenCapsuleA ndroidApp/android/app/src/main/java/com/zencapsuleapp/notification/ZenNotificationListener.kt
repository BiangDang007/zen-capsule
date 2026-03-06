package com.zencapsuleapp.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Zen Capsule — Android Notification Listener
 *
 * This is the CORE of Android's content-level filtering.
 * It can read ALL incoming notifications from ANY app,
 * extract the text content, and decide whether to:
 *   1. Block it (store for later summary)
 *   2. Let it through (urgent message breakthrough)
 *
 * This is something iOS/macOS CANNOT do.
 */
class ZenNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "ZenNotificationListener"
        private const val CHANNEL_ID = "zen_breakthrough"
        private const val API_BASE = "http://10.0.2.2:3000/api/v1" // Emulator → localhost

        // Apps to monitor (package names)
        val MONITORED_APPS = setOf(
            "com.facebook.orca",          // Messenger
            "com.facebook.katana",        // Facebook
            "com.instagram.android",      // Instagram
            "com.zhiliaoapp.musically",   // TikTok
            "com.instagram.barcelona",    // Threads
            "com.google.android.gm",      // Gmail
            "com.whatsapp",               // WhatsApp
            "com.twitter.android",        // Twitter/X
            "jp.naver.line.android",      // LINE
            "org.telegram.messenger",     // Telegram
        )

        // Urgent keywords (local pre-check, no API needed)
        val URGENT_KEYWORDS = listOf(
            "急", "緊急", "掛掉", "壞掉", "立刻", "馬上",
            "火", "修", "趕快", "出問題", "異常",
            "crash", "down", "urgent", "asap", "emergency",
            "critical", "outage", "incident"
        )

        // State
        var isFocusing = false
        var authToken: String? = null
        var interceptedNotifications = mutableListOf<InterceptedNotification>()

        // Callback to React Native
        var onNotificationIntercepted: ((InterceptedNotification) -> Unit)? = null
        var onBreakthroughTriggered: ((InterceptedNotification) -> Unit)? = null
    }

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
        Log.d(TAG, "ZenNotificationListener created")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Only process during focus mode
        if (!isFocusing) return

        val packageName = sbn.packageName

        // Only monitor specific apps
        if (packageName !in MONITORED_APPS) return

        // Extract notification content
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val appName = getAppName(packageName)

        if (title.isEmpty() && text.isEmpty()) return

        Log.d(TAG, "Intercepted from $appName: $title — $text")

        val notification = InterceptedNotification(
            packageName = packageName,
            appName = appName,
            title = title,
            text = text,
            timestamp = System.currentTimeMillis()
        )

        // Cancel the original notification (block it!)
        cancelNotification(sbn.key)

        // Check urgency
        Thread {
            val urgencyResult = checkUrgency(title, text, appName)

            val updatedNotification = notification.copy(
                isUrgent = urgencyResult.isUrgent,
                urgencyScore = urgencyResult.score,
                urgencyReason = urgencyResult.reason
            )

            // Store for later summary
            synchronized(interceptedNotifications) {
                interceptedNotifications.add(updatedNotification)
                if (interceptedNotifications.size > 100) {
                    interceptedNotifications.removeAt(0)
                }
            }

            // Notify React Native
            onNotificationIntercepted?.invoke(updatedNotification)

            if (urgencyResult.isUrgent) {
                // BREAKTHROUGH! Show our own notification
                showBreakthroughNotification(updatedNotification)
                onBreakthroughTriggered?.invoke(updatedNotification)
                Log.d(TAG, "🚨 BREAKTHROUGH: $appName — $title (score: ${urgencyResult.score})")
            } else {
                Log.d(TAG, "🛡 Blocked: $appName — $title (score: ${urgencyResult.score})")
            }
        }.start()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // No action needed
    }

    // ─── Urgency Check (2-phase: local keywords → AI API) ────

    data class UrgencyResult(
        val isUrgent: Boolean,
        val score: Int,
        val reason: String
    )

    private fun checkUrgency(title: String, text: String, appName: String): UrgencyResult {
        val combined = "$title $text".lowercase()

        // Phase 1: Local keyword check (instant, no network)
        for (keyword in URGENT_KEYWORDS) {
            if (combined.contains(keyword.lowercase())) {
                return UrgencyResult(
                    isUrgent = true,
                    score = 90,
                    reason = "Keyword match: $keyword"
                )
            }
        }

        // Phase 2: AI analysis via Claude API
        val token = authToken ?: return UrgencyResult(false, 0, "No auth token")

        return try {
            val url = URL("$API_BASE/ai/analyse")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.connectTimeout = 3000
            conn.readTimeout = 5000
            conn.doOutput = true

            val body = JSONObject().apply {
                put("message", "$title: $text")
                put("sender", appName)
            }

            conn.outputStream.bufferedWriter().use { it.write(body.toString()) }

            val response = conn.inputStream.bufferedReader().readText()
            val json = JSONObject(response)

            UrgencyResult(
                isUrgent = json.optBoolean("shouldBreakthrough", false),
                score = json.optInt("score", 0),
                reason = json.optString("reason", "AI analysis")
            )
        } catch (e: Exception) {
            Log.w(TAG, "AI analysis failed: ${e.message}")
            UrgencyResult(false, 0, "AI unavailable: ${e.message}")
        }
    }

    // ─── Breakthrough Notification ───────────────────────

    private fun showBreakthroughNotification(notif: InterceptedNotification) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("⚡ Urgent: ${notif.appName}")
            .setContentText("${notif.title}: ${notif.text}")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        manager.notify(notif.timestamp.toInt(), notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Zen Capsule Breakthrough",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgent messages that break through focus mode"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    // ─── Helpers ─────────────────────────────────────────

    private fun getAppName(packageName: String): String {
        return when (packageName) {
            "com.facebook.orca" -> "Messenger"
            "com.facebook.katana" -> "Facebook"
            "com.instagram.android" -> "Instagram"
            "com.zhiliaoapp.musically" -> "TikTok"
            "com.instagram.barcelona" -> "Threads"
            "com.google.android.gm" -> "Gmail"
            "com.whatsapp" -> "WhatsApp"
            "com.twitter.android" -> "Twitter/X"
            "jp.naver.line.android" -> "LINE"
            "org.telegram.messenger" -> "Telegram"
            else -> packageName
        }
    }
}
