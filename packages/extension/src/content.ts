// Zen Capsule · Content Script (runs inside mail.google.com)

import type { InterceptedEmail, ExtensionMessage } from './types'

let isFocusing = false
let observer: MutationObserver | null = null
let interceptedEmails: InterceptedEmail[] = []
const seenEmailIds = new Set<string>()

// ── Init ───────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
  if (data?.isFocusing) activateShield()
})

chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
  if (msg.type === 'FOCUS_STATE_CHANGED') {
    msg.isFocusing ? activateShield() : deactivateShield()
  }
})

// ── Activate ───────────────────────────────────────
function activateShield(): void {
  if (isFocusing) return
  isFocusing = true

  overrideNotifications()
  suppressUnreadCounts()
  injectBanner()
  startEmailWatcher()
}

function deactivateShield(): void {
  isFocusing = false
  restoreNotifications()
  restoreUnreadCounts()
  removeBanner()
  stopEmailWatcher()
}

// ── 1. Block system notifications ─────────────────
const _OriginalNotification = window.Notification
function overrideNotifications(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).Notification = function (title: string, options?: NotificationOptions) {
    chrome.runtime.sendMessage({
      type: 'EMAIL_INTERCEPTED',
      email: {
        from: options?.body || '',
        subject: title || '',
        time: new Date().toISOString(),
        source: 'system_notification' as const
      }
    })
    return { close: () => {} }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).Notification.permission = 'granted'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).Notification.requestPermission = () => Promise.resolve('granted' as NotificationPermission)
}
function restoreNotifications(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).Notification = _OriginalNotification
}

// ── 2. Hide unread badge counts ────────────────────
let hiddenEls: HTMLElement[] = []
function suppressUnreadCounts(): void {
  updateTitle()

  const selectors = ['.bsU', '.CL', '.nU', '[data-count]']
  selectors.forEach(sel => {
    document.querySelectorAll<HTMLElement>(sel).forEach(el => {
      if (!el.dataset.zcHidden) {
        el.dataset.zcHidden = 'true'
        el.dataset.zcOrigVis = el.style.visibility
        el.style.visibility = 'hidden'
        hiddenEls.push(el)
      }
    })
  })
}
function restoreUnreadCounts(): void {
  hiddenEls.forEach(el => {
    el.style.visibility = el.dataset.zcOrigVis || ''
    delete el.dataset.zcHidden
  })
  hiddenEls = []
  document.title = document.title.replace('🛡 ', '')
}
function updateTitle(): void {
  if (!isFocusing) return
  if (/^\(\d+\)/.test(document.title)) {
    document.title = document.title.replace(/^\(\d+\)\s*/, '🛡 ')
  } else if (!document.title.startsWith('🛡')) {
    document.title = '🛡 ' + document.title
  }
}

// ── 3. Shield banner ───────────────────────────────
function injectBanner(): void {
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
function removeBanner(): void {
  document.getElementById('zc-banner')?.remove()
  document.body.style.marginTop = ''
}
function updateBannerCount(): void {
  const el = document.getElementById('zc-count')
  if (el) el.textContent = `已攔截 ${interceptedEmails.length} 封`
}

// ── 4. Watch for incoming emails ───────────────────
function startEmailWatcher(): void {
  snapshotCurrentEmails()

  observer = new MutationObserver(() => {
    if (!isFocusing) return
    updateTitle()
    suppressUnreadCounts()
    checkForNewEmails()
  })

  const inbox = document.querySelector('[role="main"]') || document.body
  observer.observe(inbox, { childList: true, subtree: true, attributes: true })

  const titleEl = document.querySelector('title') || document.head
  const titleObserver = new MutationObserver(() => { if (isFocusing) updateTitle() })
  titleObserver.observe(titleEl, { subtree: true, childList: true, characterData: true })
}

function stopEmailWatcher(): void {
  observer?.disconnect()
  observer = null
}

function snapshotCurrentEmails(): void {
  document.querySelectorAll<HTMLTableRowElement>('tr.zA').forEach(row => {
    const id = row.getAttribute('id') || getEmailId(row)
    if (id) seenEmailIds.add(id)
  })
}

function checkForNewEmails(): void {
  document.querySelectorAll<HTMLTableRowElement>('tr.zA').forEach(row => {
    const id = row.getAttribute('id') || getEmailId(row)
    if (!id || seenEmailIds.has(id)) return

    seenEmailIds.add(id)
    const emailData = extractEmailData(row)
    if (!emailData) return

    interceptedEmails.push(emailData)

    chrome.runtime.sendMessage({ type: 'EMAIL_INTERCEPTED', email: emailData })

    updateBannerCount()

    row.style.opacity = '0.35'
    row.style.filter = 'grayscale(50%)'
    row.title = '🛡 Zen Capsule 已攔截 · 休息時查看'
  })
}

function getEmailId(row: HTMLTableRowElement): string | null {
  const link = row.querySelector('a')
  return link?.href?.match(/\/#.*?\/([a-f0-9]+)/)?.[1] || null
}

function extractEmailData(row: HTMLTableRowElement): InterceptedEmail | null {
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
  } catch {
    return null
  }
}
