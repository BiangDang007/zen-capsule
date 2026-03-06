/**
 * Zen Capsule — Hosts File Blocker
 *
 * Modifies /etc/hosts to block distracting domains at OS level.
 * This is the "nuclear option" — no browser, no app, nothing can reach
 * blocked domains while focus is active.
 *
 * LOCKDOWN MODE: Once focus starts, block cannot be removed until
 * the timer expires. There is NO manual override.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../shared/config');

const HOSTS_PATH = process.platform === 'win32'
  ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
  : '/etc/hosts';

const REDIRECT_IP = '127.0.0.1';

/**
 * Generate hosts file entries for all blocked domains
 */
function generateBlockEntries() {
  const lines = [config.HOSTS_MARKER_START];
  for (const domain of config.BLOCKED_DOMAINS) {
    lines.push(`${REDIRECT_IP}  ${domain}`);
  }
  lines.push(config.HOSTS_MARKER_END);
  return lines.join('\n');
}

/**
 * Read current hosts file content
 */
function readHostsFile() {
  try {
    return fs.readFileSync(HOSTS_PATH, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Remove any existing Zen Capsule entries from hosts content
 */
function removeZenEntries(hostsContent) {
  const startIdx = hostsContent.indexOf(config.HOSTS_MARKER_START);
  const endIdx = hostsContent.indexOf(config.HOSTS_MARKER_END);

  if (startIdx === -1 || endIdx === -1) return hostsContent;

  const before = hostsContent.substring(0, startIdx);
  const after = hostsContent.substring(endIdx + config.HOSTS_MARKER_END.length);

  return (before + after).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Write to hosts file using sudo (macOS) or elevated privileges (Windows)
 * Returns a Promise<boolean>
 */
function writeHostsFile(content) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      // macOS: use osascript to get sudo permission with a friendly dialog
      const escaped = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const script = `do shell script "echo \\"${escaped}\\" > ${HOSTS_PATH} && dscacheutil -flushcache && killall -HUP mDNSResponder" with administrator privileges`;

      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('[HostsBlocker] Failed to write hosts:', error.message);
          reject(error);
        } else {
          console.log('[HostsBlocker] Hosts file updated successfully');
          resolve(true);
        }
      });
    } else if (process.platform === 'win32') {
      // Windows: write directly (app should be run as admin, or use PowerShell elevation)
      const tempPath = path.join(require('os').tmpdir(), 'zen-hosts-temp');
      fs.writeFileSync(tempPath, content, 'utf-8');

      const psCmd = `Start-Process powershell -Verb RunAs -ArgumentList '-Command', 'Copy-Item \\"${tempPath}\\" \\"${HOSTS_PATH}\\" -Force; ipconfig /flushdns'`;
      exec(`powershell -Command "${psCmd}"`, (error) => {
        if (error) {
          console.error('[HostsBlocker] Failed to write hosts:', error.message);
          reject(error);
        } else {
          console.log('[HostsBlocker] Hosts file updated successfully');
          resolve(true);
        }
      });
    }
  });
}

/**
 * ACTIVATE BLOCK — Add blocked domains to hosts file
 * Once called, domains are unreachable system-wide
 */
async function activateBlock() {
  console.log('[HostsBlocker] Activating system-wide block...');
  const current = readHostsFile();
  const cleaned = removeZenEntries(current);
  const blockEntries = generateBlockEntries();
  const newContent = cleaned + '\n\n' + blockEntries + '\n';

  await writeHostsFile(newContent);
  console.log(`[HostsBlocker] Blocked ${config.BLOCKED_DOMAINS.length} domains`);
  return true;
}

/**
 * DEACTIVATE BLOCK — Remove blocked domains from hosts file
 * This ONLY gets called when the timer expires. No manual trigger.
 */
async function deactivateBlock() {
  console.log('[HostsBlocker] Deactivating block (timer expired)...');
  const current = readHostsFile();
  const cleaned = removeZenEntries(current);

  await writeHostsFile(cleaned);
  console.log('[HostsBlocker] All domains unblocked');
  return true;
}

/**
 * Check if block is currently active
 */
function isBlockActive() {
  const content = readHostsFile();
  return content.includes(config.HOSTS_MARKER_START);
}

/**
 * Emergency cleanup — called on app crash/exit to prevent permanent lock
 * This is the ONLY safety valve besides timer expiry
 */
async function emergencyCleanup() {
  if (isBlockActive()) {
    console.log('[HostsBlocker] Emergency cleanup — removing blocks');
    try {
      await deactivateBlock();
    } catch (err) {
      console.error('[HostsBlocker] Emergency cleanup failed:', err.message);
      // Last resort: tell user how to manually fix
      console.error(`Manual fix: sudo nano ${HOSTS_PATH} and remove lines between ZEN CAPSULE markers`);
    }
  }
}

module.exports = {
  activateBlock,
  deactivateBlock,
  isBlockActive,
  emergencyCleanup,
};
