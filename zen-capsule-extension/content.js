// Zen Capsule · Content Script (runs inside mail.google.com)

let isFocusing = false
let observer = null
let interceptedEmails = []
let seenEmailIds = new Set()

// ── Init ───────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
  if (data?.isFocusing) activateShield()
})

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FOCUS_STATE_CHANGED') {
    msg.isFocusing ? activateShield() : deactivateShield()
  }
})

// ── Activate ───────────────────────────────────────
function activateShield() {
  if (isFocusing) return
  isFocusing = true
  
  overrideNotifications()   // Block system notifications from this page
  suppressUnreadCounts()    // Hide badge numbers
  injectBanner()            // Show shield banner
  startEmailWatcher()       // Watch for new emails arriving
}

function deactivateShield() {
  isFocusing = false
  restoreNotifications()
  restoreUnreadCounts()
  removeBanner()
  stopEmailWatcher()
}

// ── 1. Block system notifications ─────────────────
// Override the page's Notification API so Gmail can't fire system alerts
let _OriginalNotification = window.Notification
function overrideNotifications() {
  window.Notification = function(title, options) {
    // Silently swallow during focus — send to background for logging
    chrome.runtime.sendMessage({
      type: 'EMAIL_INTERCEPTED',
      email: {
        from: options?.body || '',
        subject: title || '',
        time: new Date().toISOString(),
        source: 'system_notification'
      }
    })
    return { close: () => {} }
  }
  window.Notification.permission = 'granted'
  window.Notification.requestPermission = () => Promise.resolve('granted')
}
function restoreNotifications() {
  window.Notification = _OriginalNotification
}

// ── 2. Hide unread badge counts ────────────────────
let hiddenEls = []
function suppressUnreadCounts() {
  // Hide tab title unread number
  updateTitle()
  
  // Hide left-nav unread counts
  const selectors = ['.bsU', '.CL', '.nU', '[data-count]']
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (!el.dataset.zcHidden) {
        el.dataset.zcHidden = 'true'
        el.dataset.zcOrigVis = el.style.visibility
        el.style.visibility = 'hidden'
        hiddenEls.push(el)
      }
    })
  })
}
function restoreUnreadCounts() {
  hiddenEls.forEach(el => {
    el.style.visibility = el.dataset.zcOrigVis || ''
    delete el.dataset.zcHidden
  })
  hiddenEls = []
  document.title = document.title.replace('🛡 ', '')
}
function updateTitle() {
  if (!isFocusing) return
  if (/^\(\d+\)/.test(document.title)) {
    document.title = document.title.replace(/^\(\d+\)\s*/, '🛡 ')
  } else if (!document.title.startsWith('🛡')) {
    document.title = '🛡 ' + document.title
  }
}

// ── 3. Shield banner ───────────────────────────────
function injectBanner() {
  if (document.getElementById('zc-banner')) return
  const banner = document.createElement('div')
  banner.id = 'zc-banner'
  banner.style.cssText = `
    position:fixed; top:0; left:0; right:0; z-index:999999;
    background:#1a1208; border-bottom:2px solid rgba(212,136,74,0.35);
    padding:10px 20px; display:flex; align-items:center; justify-content:space-between;
    font-family:'Space Mono',monospace; font-size:12px; color:#d4884a;
    letter-spacing:0.1em; box-shadow:0 2px 20px rgba(0,0,0,0.5);
  `
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span>🛡</span>
      <span>ZEN CAPSULE · 專注中 · Gmail 通知已封鎖</span>
    </div>
    <div id="zc-count" style="color:#6b5e50;font-size:11px;">已攔截 0 封</div>
  `
  document.documentElement.prepend(banner)
  document.body.style.marginTop = '43px'
}
function removeBanner() {
  document.getElementById('zc-banner')?.remove()
  document.body.style.marginTop = ''
}
function updateBannerCount() {
  const el = document.getElementById('zc-count')
  if (el) el.textContent = `已攔截 ${interceptedEmails.length} 封`
}

// ── 4. Watch for incoming emails ───────────────────
function startEmailWatcher() {
  // Snapshot current inbox rows before focus
  snapshotCurrentEmails()

  observer = new MutationObserver(() => {
    if (!isFocusing) return
    updateTitle()
    suppressUnreadCounts()
    checkForNewEmails()
  })

  const inbox = document.querySelector('[role="main"]') || document.body
  observer.observe(inbox, { childList: true, subtree: true, attributes: true })
  
  // Also watch document title
  const titleObserver = new MutationObserver(() => { if (isFocusing) updateTitle() })
  titleObserver.observe(document.querySelector('title') || document.head, { subtree: true, childList: true, characterData: true })
}

function stopEmailWatcher() {
  observer?.disconnect()
  observer = null
}

function snapshotCurrentEmails() {
  // Mark all currently visible email rows as "seen before focus"
  document.querySelectorAll('tr.zA').forEach(row => {
    const id = row.getAttribute('id') || getEmailId(row)
    if (id) seenEmailIds.add(id)
  })
}

function checkForNewEmails() {
  document.querySelectorAll('tr.zA').forEach(row => {
    const id = row.getAttribute('id') || getEmailId(row)
    if (!id || seenEmailIds.has(id)) return
    
    // New email arrived during focus!
    seenEmailIds.add(id)
    const emailData = extractEmailData(row)
    if (!emailData) return
    
    interceptedEmails.push(emailData)
    
    // Send to background for storage
    chrome.runtime.sendMessage({ type: 'EMAIL_INTERCEPTED', email: emailData })
    
    updateBannerCount()
    
    // Visually dim the row to indicate it's intercepted
    row.style.opacity = '0.35'
    row.style.filter = 'grayscale(50%)'
    row.title = '🛡 Zen Capsule 已攔截 · 休息時查看'
  })
}

function getEmailId(row) {
  // Try to get a stable ID from the row
  const link = row.querySelector('a')
  return link?.href?.match(/\/#.*?\/([a-f0-9]+)/)?.[1] || null
}

function extractEmailData(row) {
  try {
    const sender = row.querySelector('.yX.xY')?.textContent?.trim() ||
                   row.querySelector('[email]')?.getAttribute('email') ||
                   row.querySelector('.zF')?.getAttribute('email') || '未知寄件者'
    
    const subject = row.querySelector('.y6 span')?.textContent?.trim() ||
                    row.querySelector('[data-thread-id] .bog')?.textContent?.trim() ||
                    row.querySelector('.y6')?.textContent?.trim() || '（無主旨）'
    
    const preview = row.querySelector('.y2')?.textContent?.trim() || ''
    
    const timeEl = row.querySelector('.xW.xY span') || row.querySelector('[title]')
    const time = timeEl?.getAttribute('title') || timeEl?.textContent?.trim() || ''

    return { sender, subject, preview, time, source: 'gmail_dom' }
  } catch (e) {
    return null
  }
}
