/**
 * Zen Capsule — macOS Focus Mode Integration
 *
 * Uses AppleScript + Shortcuts to:
 * 1. Activate macOS "Do Not Disturb" during focus
 * 2. Only allow phone calls through
 * 3. All other notifications silenced and stored for summary
 *
 * Note: macOS doesn't allow reading other apps' notification content,
 * so App-level filtering is the maximum granularity on Mac.
 * Content-level AI filtering only works for Email (via IMAP).
 */

const { exec } = require('child_process');

/**
 * Activate macOS Do Not Disturb mode
 * This silences ALL notifications except phone calls
 */
function activateDND() {
  return new Promise((resolve, reject) => {
    // macOS Ventura+ uses Focus system
    // We activate DND via shortcuts or control center scripting
    const script = `
      tell application "System Events"
        -- Open Control Center and toggle Focus/DND
        -- Method 1: Use keyboard shortcut or menu bar
        try
          -- For macOS Sonoma/Sequoia: toggle via Shortcuts
          do shell script "shortcuts run 'Zen Focus On' 2>/dev/null || true"
        end try

        -- Method 2: Fallback — set DND via defaults
        try
          do shell script "defaults -currentHost write com.apple.notificationcenterui dndStart -float 0"
          do shell script "defaults -currentHost write com.apple.notificationcenterui dndEnd -float 1440"
          do shell script "defaults -currentHost write com.apple.notificationcenterui doNotDisturb -bool true"
          do shell script "killall NotificationCenter 2>/dev/null || true"
        end try
      end tell
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (error) => {
      if (error) {
        console.warn('[macOSFocus] DND activation warning:', error.message);
        // Don't reject — DND is a nice-to-have, hosts blocking is the real blocker
        resolve(false);
      } else {
        console.log('[macOSFocus] DND activated');
        resolve(true);
      }
    });
  });
}

/**
 * Deactivate macOS Do Not Disturb mode
 */
function deactivateDND() {
  return new Promise((resolve, reject) => {
    const script = `
      tell application "System Events"
        try
          do shell script "shortcuts run 'Zen Focus Off' 2>/dev/null || true"
        end try

        try
          do shell script "defaults -currentHost write com.apple.notificationcenterui doNotDisturb -bool false"
          do shell script "killall NotificationCenter 2>/dev/null || true"
        end try
      end tell
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (error) => {
      if (error) {
        console.warn('[macOSFocus] DND deactivation warning:', error.message);
        resolve(false);
      } else {
        console.log('[macOSFocus] DND deactivated');
        resolve(true);
      }
    });
  });
}

/**
 * Check if DND is currently active
 */
function isDNDActive() {
  return new Promise((resolve) => {
    exec(
      'defaults -currentHost read com.apple.notificationcenterui doNotDisturb 2>/dev/null',
      (error, stdout) => {
        resolve(stdout.trim() === '1');
      }
    );
  });
}

/**
 * Create macOS Shortcuts for Zen Focus (one-time setup)
 * User needs to create these shortcuts manually in Shortcuts app:
 *
 * "Zen Focus On":
 *   - Action: Set Focus → Do Not Disturb → Turn On → Until turned off
 *
 * "Zen Focus Off":
 *   - Action: Set Focus → Do Not Disturb → Turn Off
 *
 * We provide a setup guide in the app UI.
 */
function getSetupInstructions() {
  return {
    title: 'One-time Setup: macOS Focus Mode',
    steps: [
      'Open the Shortcuts app on your Mac',
      'Create a new shortcut called "Zen Focus On"',
      'Add action: "Set Focus" → select "Do Not Disturb" → "Turn On" → "Until Turned Off"',
      'Create another shortcut called "Zen Focus Off"',
      'Add action: "Set Focus" → select "Do Not Disturb" → "Turn Off"',
      'Go to System Settings → Focus → Do Not Disturb',
      'Under "Allowed Notifications", add only: Phone calls',
      'Remove all other apps from the allow list',
    ],
  };
}

module.exports = {
  activateDND,
  deactivateDND,
  isDNDActive,
  getSetupInstructions,
};
