const API = 'http://localhost:3000/api/v1'

chrome.alarms.create('pollFocusState', { periodInMinutes: 0.167 })
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pollFocusState') await checkFocusState()
  if (alarm.name === 'clearOverride') await clearGmailOverride()
})
checkFocusState()

async function checkFocusState() {
  const { token } = await chrome.storage.local.get('token')
  if (!token) { await setFocusMode(false); return }
  try {
    const res = await fetch(`${API}/sync/state`, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) { await setFocusMode(false); return }
    const data = await res.json()
    await setFocusMode(data.focusState?.isFocusing || false, data.focusState)
  } catch (e) {
    const { isFocusing, focusState } = await chrome.storage.local.get(['isFocusing','focusState'])
    notifyGmailTabs(isFocusing, focusState)
  }
}

async function setFocusMode(active, focusState = null) {
  await chrome.storage.local.set({ isFocusing: active })
  chrome.action.setBadgeText({ text: active ? '🛡' : '' })
  chrome.action.setBadgeBackgroundColor({ color: '#d4884a' })
  await setGmailBlock(active)
  notifyGmailTabs(active, focusState)
}

async function setGmailBlock(enable) {
  const { gmailOverride } = await chrome.storage.local.get('gmailOverride')
  if (gmailOverride && enable) return
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enable ? ['block_gmail'] : [],
      disableRulesetIds: enable ? [] : ['block_gmail']
    })
  } catch (e) { console.log('[ZenCapsule] Rule error:', e.message) }
}

async function clearGmailOverride() {
  await chrome.storage.local.set({ gmailOverride: false })
  const { isFocusing } = await chrome.storage.local.get('isFocusing')
  if (isFocusing) await setGmailBlock(true)
}

function notifyGmailTabs(active, focusState) {
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'FOCUS_STATE_CHANGED', isFocusing: active, focusState }).catch(() => {})
    }
  })
}

// ── Real-time urgency check ────────────────────────
async function checkEmailUrgency(email) {
  const { token, isFocusing } = await chrome.storage.local.get(['token','isFocusing'])
  if (!token || !isFocusing) return

  // Local pre-check: 關鍵詞直接判定為 critical，不用等 API
  const urgentKeywords = ['急','緊急','掛掉','壞掉','crash','down','urgent','ASAP','立刻','馬上','火','修','趕快','出問題','異常']
  const text = `${email.subject} ${email.preview}`.toLowerCase()
  const hasUrgentKeyword = urgentKeywords.some(k => text.includes(k.toLowerCase()))

  if (hasUrgentKeyword) {
    // 直接穿透，不等 AI
    await triggerBreakthrough(email, { score: 90, category: 'critical', reason: '偵測到緊急關鍵詞' })
    return
  }

  // 非關鍵詞 → 交給 AI 判斷
  try {
    const res = await fetch(`${API}/ai/analyse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        content: `主旨：${email.subject}\n內容：${email.preview}`,
        senderName: email.sender,
        repeatCount: 1
      })
    })
    const data = await res.json()
    const result = data.result

    // 更新 capturedEmails 裡這封信的 urgency 分數
    const { capturedEmails = [] } = await chrome.storage.local.get('capturedEmails')
    const updated = capturedEmails.map(e =>
      (e.subject === email.subject && (e.sender || e.from) === email.sender)
        ? { ...e, urgency: result }
        : e
    )
    await chrome.storage.local.set({ capturedEmails: updated })

    if (result.shouldBreakthrough) {
      await triggerBreakthrough(email, result)
    }
  } catch (e) {
    console.log('[ZenCapsule] Urgency check failed:', e.message)
  }
}

async function triggerBreakthrough(email, result) {
  // 顯示系統通知
  chrome.notifications.create(`urgent_${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icon48.png',
    title: `⚡ 緊急信件穿透 · ${email.sender || '未知'}`,
    message: email.subject || '',
    priority: 2,
    requireInteraction: true
  })

  // 暫時解鎖 Gmail 5 分鐘
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    disableRulesetIds: ['block_gmail'], enableRulesetIds: []
  })
  await chrome.storage.local.set({ gmailOverride: true })
  chrome.alarms.create('clearOverride', { delayInMinutes: 5 })

  // 更新 capturedEmails 標記為已穿透
  const { capturedEmails = [] } = await chrome.storage.local.get('capturedEmails')
  const updated = capturedEmails.map(e =>
    (e.subject === email.subject)
      ? { ...e, urgency: { ...result, breakthrough: true } }
      : e
  )
  await chrome.storage.local.set({ capturedEmails: updated })
}

// ── Messages ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['isFocusing','focusState','token','capturedEmails'], (data) => sendResponse(data))
    return true
  }
  if (msg.type === 'SET_TOKEN') {
    chrome.storage.local.set({ token: msg.token }, () => { checkFocusState(); sendResponse({ ok: true }) })
    return true
  }
  if (msg.type === 'LOGOUT') {
    chrome.storage.local.set({ token: null, isFocusing: false, focusState: null, capturedEmails: [] }, () => {
      setFocusMode(false); sendResponse({ ok: true })
    })
    return true
  }
  if (msg.type === 'FORCE_CHECK') {
    checkFocusState().then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'EMAIL_INTERCEPTED') {
    chrome.storage.local.get('capturedEmails', ({ capturedEmails = [] }) => {
      const updated = [msg.email, ...capturedEmails].slice(0, 20)
      chrome.storage.local.set({ capturedEmails: updated })
    })
    checkEmailUrgency(msg.email) // async, don't block
    sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'CLEAR_EMAILS') {
    chrome.storage.local.set({ capturedEmails: [] }); sendResponse({ ok: true })
    return true
  }
  if (msg.type === 'GMAIL_OVERRIDE') {
    chrome.storage.local.set({ gmailOverride: true }, async () => {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['block_gmail'], enableRulesetIds: [] })
      chrome.alarms.create('clearOverride', { delayInMinutes: 5 })
      sendResponse({ ok: true })
    })
    return true
  }
})
