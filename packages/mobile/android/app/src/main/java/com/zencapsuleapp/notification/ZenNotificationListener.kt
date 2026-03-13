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
        private const val API_BASE = "http://10.0.2.2:3001/api/v1" // Emulator → localhost

        // System / own packages that must never be intercepted
        private val SKIP_PACKAGES = setOf(
            "com.zencapsuleapp",          // ourselves
            "android",
            "com.android.systemui",
            "com.android.system",
            "com.google.android.googlequicksearchbox",
        )

        // Package prefix patterns to skip (system internals)
        private val SKIP_PREFIXES = listOf(
            "com.android.",
            "com.google.android.gms",
            "com.google.android.gsf",
        )

        // Urgent keywords (local pre-check, no API needed)
        val URGENT_KEYWORDS = listOf(
            "急", "緊急", "掛掉", "壞掉", "立刻", "馬上",
            "火", "修", "趕快", "出問題", "異常",
            "crash", "down", "urgent", "asap", "emergency",
            "critical", "outage", "incident"
        )

        // State shared with ZenNotificationModule (React Native bridge)
        var isFocusing = false
        var authToken: String? = null
        var interceptedNotifications = mutableListOf<InterceptedNotification>()
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
        Log.d(TAG, "ZenNotificationListener created — monitoring ALL apps")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!isFocusing) return

        val packageName = sbn.packageName

        // Skip system and self notifications
        if (packageName in SKIP_PACKAGES) return
        if (SKIP_PREFIXES.any { packageName.startsWith(it) }) return

        // Extract content
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text  = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()  ?: ""

        // Skip empty / silent notifications
        if (title.isEmpty() && text.isEmpty()) return

        val appName = resolveAppName(packageName)

        Log.d(TAG, "Intercepted [$appName] $title — $text")

        val notification = InterceptedNotification(
            packageName = packageName,
            appName = appName,
            title = title,
            text = text,
            timestamp = System.currentTimeMillis()
        )

        // Block the original immediately
        cancelNotification(sbn.key)

        Thread {
            val urgencyResult = checkUrgency(title, text, appName, packageName)

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
        }.start()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) { /* no-op */ }

    // ── Urgency Check (2-phase: local keyword → AI) ───────────────────────────

    data class UrgencyResult(val isUrgent: Boolean, val score: Int, val reason: String)

    private fun checkUrgency(title: String, text: String, appName: String, packageName: String): UrgencyResult {
        val combined = "$title $text".lowercase()

        // Phase 1: instant keyword check
        for (kw in URGENT_KEYWORDS) {
            if (combined.contains(kw.lowercase())) {
                return UrgencyResult(true, 90, "Keyword match: $kw")
            }
        }

        // Phase 2: Claude AI
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
                put("content", if (title.isNotEmpty()) "$title: $text" else text)
                put("senderName", appName)
                put("subject", title)
                put("preview", text)
                put("appName", appName)
                put("packageName", packageName)
            }

            conn.outputStream.bufferedWriter().use { it.write(body.toString()) }

            val response = conn.inputStream.bufferedReader().readText()
            val json = JSONObject(response)
            val result = json.getJSONObject("result")

            UrgencyResult(
                isUrgent = result.optBoolean("shouldBreakthrough", false),
                score    = result.optInt("score", 0),
                reason   = result.optString("reason", "AI analysis")
            )
        } catch (e: Exception) {
            Log.w(TAG, "AI analysis failed: ${e.message}")
            UrgencyResult(false, 0, "AI unavailable")
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
        manager.notify(notif.timestamp.toInt(), n)
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
