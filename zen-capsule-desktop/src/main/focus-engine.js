/**
 * Zen Capsule — Focus Engine
 *
 * Manages focus sessions with LOCKDOWN mode.
 * Once a session starts, it CANNOT be stopped manually.
 * Only the timer expiry can end the session.
 */

const Store = require('electron-store');
const { activateBlock, deactivateBlock, isBlockActive } = require('./hosts-blocker');
const { activateDND, deactivateDND } = require('./macos-focus');
const { Notification } = require('electron');
const config = require('../shared/config');

const store = new Store({
  name: 'zen-capsule-state',
  encryptionKey: 'zen-capsule-2026', // basic obfuscation to prevent tampering
});

let countdownInterval = null;
let onStateChange = null; // callback to notify UI

class FocusEngine {
  constructor() {
    this.state = store.get('focusState', {
      isActive: false,
      startedAt: null,
      durationMinutes: 0,
      remainingSeconds: 0,
      goal: '',
      sessionId: null,
      interceptedNotifications: [],
    });

    // Resume session if app was quit during focus
    if (this.state.isActive) {
      this._resumeSession();
    }
  }

  /**
   * Set callback for state changes (UI updates)
   */
  onUpdate(callback) {
    onStateChange = callback;
  }

  /**
   * Get current state (read-only copy)
   */
  getState() {
    return { ...this.state };
  }

  /**
   * START FOCUS — Activates lockdown mode
   * No going back after this.
   */
  async startFocus({ durationMinutes, goal, token }) {
    if (this.state.isActive) {
      throw new Error('Focus session already active');
    }

    console.log(`[FocusEngine] Starting ${durationMinutes}min session: "${goal}"`);

    // 1. Activate system-wide block (hosts + DND)
    await activateBlock();
    await activateDND(); // Silence all notifications except phone calls

    // 2. Notify backend
    let sessionId = null;
    try {
      const res = await fetch(`${config.API_URL}/focus/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ durationMinutes, goal }),
      });
      const data = await res.json();
      sessionId = data.id || data.sessionId;
    } catch (err) {
      console.warn('[FocusEngine] Backend sync failed, continuing offline:', err.message);
    }

    // 3. Update state
    this.state = {
      isActive: true,
      startedAt: Date.now(),
      durationMinutes,
      remainingSeconds: durationMinutes * 60,
      goal,
      sessionId,
      interceptedNotifications: [],
    };
    this._persist();

    // 4. Start countdown
    this._startCountdown();

    // 5. Show notification
    new Notification({
      title: '🧘 Zen Capsule — Focus Locked',
      body: `${durationMinutes} minutes of deep focus. All distractions blocked.`,
    }).show();

    this._notifyUI();
    return this.state;
  }

  /**
   * TIMER EXPIRED — The ONLY way to end a session
   * Cannot be called manually from UI
   */
  async _endSession() {
    console.log('[FocusEngine] Timer expired — session complete!');

    // 1. Remove system block + restore notifications
    await deactivateBlock();
    await deactivateDND();

    // 2. Notify backend
    const token = store.get('token');
    if (token && this.state.sessionId) {
      try {
        await fetch(`${config.API_URL}/focus/${this.state.sessionId}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.warn('[FocusEngine] Backend end-session failed:', err.message);
      }
    }

    // 3. Clear countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    // 4. Celebration notification
    new Notification({
      title: '🎉 Focus Complete!',
      body: `Great job! You stayed focused for ${this.state.durationMinutes} minutes.`,
    }).show();

    // 5. Keep intercepted notifications for summary, but mark session done
    this.state.isActive = false;
    this.state.remainingSeconds = 0;
    this._persist();
    this._notifyUI();
  }

  /**
   * Resume a session after app restart
   */
  _resumeSession() {
    const elapsed = Math.floor((Date.now() - this.state.startedAt) / 1000);
    const totalSeconds = this.state.durationMinutes * 60;
    const remaining = totalSeconds - elapsed;

    if (remaining <= 0) {
      // Session should have ended while app was closed
      this._endSession();
    } else {
      this.state.remainingSeconds = remaining;
      this._persist();

      // Re-ensure blocks are active
      if (!isBlockActive()) {
        activateBlock().catch(console.error);
      }

      this._startCountdown();
      console.log(`[FocusEngine] Resumed session, ${remaining}s remaining`);
    }
  }

  /**
   * Internal countdown timer
   */
  _startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
      this.state.remainingSeconds--;
      this._persist();
      this._notifyUI();

      if (this.state.remainingSeconds <= 0) {
        this._endSession();
      }
    }, 1000);
  }

  /**
   * Add intercepted notification for later summary
   */
  addInterceptedNotification(notification) {
    if (!this.state.isActive) return;

    this.state.interceptedNotifications.push({
      ...notification,
      timestamp: Date.now(),
    });

    // Keep max 50
    if (this.state.interceptedNotifications.length > 50) {
      this.state.interceptedNotifications = this.state.interceptedNotifications.slice(-50);
    }

    this._persist();
    this._notifyUI();
  }

  /**
   * Check if a notification should break through (AI urgency)
   */
  async shouldBreakthrough(notification, token) {
    const text = `${notification.title || ''} ${notification.body || ''}`;

    // Phase 1: Keyword check
    const lowerText = text.toLowerCase();
    for (const keyword of config.URGENT_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        console.log(`[FocusEngine] Keyword breakthrough: "${keyword}"`);
        return { breakthrough: true, reason: `Keyword match: ${keyword}`, score: 90 };
      }
    }

    // Phase 2: AI analysis
    try {
      const res = await fetch(`${config.API_URL}/ai/analyse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          sender: notification.app || notification.sender,
        }),
      });
      const data = await res.json();
      return {
        breakthrough: data.shouldBreakthrough || false,
        reason: data.reason,
        score: data.score,
      };
    } catch (err) {
      console.warn('[FocusEngine] AI analysis failed:', err.message);
      return { breakthrough: false, reason: 'AI unavailable', score: 0 };
    }
  }

  _persist() {
    store.set('focusState', this.state);
  }

  _notifyUI() {
    if (onStateChange) onStateChange(this.getState());
  }
}

module.exports = new FocusEngine();
