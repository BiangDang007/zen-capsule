const API = 'http://localhost:3000/api/v1'
let selectedDur = 25
let timerInterval = null
let timerTotal = 0

// ── Init ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('loginBtn').addEventListener('click', login)
  document.getElementById('registerBtn').addEventListener('click', openSite)
  document.getElementById('startBtn').addEventListener('click', startFocus)
  document.getElementById('endBtn').addEventListener('click', endFocus)
  document.getElementById('continueBtn').addEventListener('click', continueFromBreak)
  document.getElementById('openSiteBtn').addEventListener('click', openSite)
  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('dur25').addEventListener('click', () => selectDur(25))
  document.getElementById('dur45').addEventListener('click', () => selectDur(45))
  document.getElementById('dur90').addEventListener('click', () => selectDur(90))
  document.getElementById('durX').addEventListener('click', toggleCustom)
  document.getElementById('customDurInput').addEventListener('input', (e) => {
    selectedDur = parseInt(e.target.value) || 0
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginView').style.display !== 'none') login()
  })

  const { token, isFocusing, focusState } = await chrome.storage.local.get(['token','isFocusing','focusState'])
  if (!token) { show('loginView'); return }
  document.getElementById('logoutBtn').style.display = 'block'

  if (isFocusing && focusState) {
    showActiveView(focusState)
  } else {
    const { capturedEmails } = await chrome.storage.local.get('capturedEmails')
    if (capturedEmails?.length > 0) {
      show('breakView')
      loadBreakSummary(capturedEmails)
    } else {
      show('setupView')
    }
  }
})

// ── Login ──────────────────────────────────────────
async function login() {
  const email = document.getElementById('emailInput').value.trim()
  const pass = document.getElementById('passInput').value
  const err = document.getElementById('loginErr')
  err.style.display = 'none'
  if (!email || !pass) { showErr(err, '請填入 email 和密碼'); return }
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '登入失敗')
    await chrome.runtime.sendMessage({ type: 'SET_TOKEN', token: data.accessToken })
    document.getElementById('logoutBtn').style.display = 'block'
    show('setupView')
  } catch (e) { showErr(document.getElementById('loginErr'), e.message) }
}

// ── Duration ───────────────────────────────────────
function selectDur(mins) {
  selectedDur = mins
  ;['25','45','90'].forEach(d => document.getElementById('dur'+d).classList.toggle('selected', String(mins)===d))
  document.getElementById('durX').classList.remove('selected')
  document.getElementById('customDurRow').style.display = 'none'
}
function toggleCustom() {
  const row = document.getElementById('customDurRow')
  const showing = row.style.display !== 'none'
  row.style.display = showing ? 'none' : 'flex'
  document.getElementById('durX').classList.toggle('selected', !showing)
  ;['25','45','90'].forEach(d => document.getElementById('dur'+d).classList.remove('selected'))
  if (!showing) document.getElementById('customDurInput').focus()
}

// ── Start focus ────────────────────────────────────
async function startFocus() {
  const goal = document.getElementById('goalInput').value.trim()
  const err = document.getElementById('setupErr')
  err.style.display = 'none'
  if (!goal) { showErr(err, '請輸入這次的目標'); return }
  if (!selectedDur || selectedDur < 1) { showErr(err, '請選擇專注時長'); return }
  const { token } = await chrome.storage.local.get('token')
  try {
    const res = await fetch(`${API}/focus/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ goal })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(JSON.stringify(data))
    const focusState = {
      isFocusing: true, currentGoal: goal,
      startedAt: new Date().toISOString(),
      durationMinutes: selectedDur,
      sessionId: data.session.id, interceptCount: 0
    }
    await chrome.storage.local.set({ isFocusing: true, focusState, capturedEmails: [] })
    chrome.runtime.sendMessage({ type: 'FORCE_CHECK' })
    showActiveView(focusState)
  } catch (e) { showErr(document.getElementById('setupErr'), e.message) }
}

// ── Active view ────────────────────────────────────
function showActiveView(focusState) {
  show('activeView')
  setPill(true)
  document.getElementById('activeGoal').textContent = `目標：${focusState.currentGoal}`
  updateInterceptCount(focusState.interceptCount || 0)
  clearInterval(timerInterval)
  const endTime = new Date(focusState.startedAt).getTime() + focusState.durationMinutes * 60 * 1000
  timerTotal = focusState.durationMinutes * 60
  timerInterval = setInterval(async () => {
    const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
    const m = Math.floor(left / 60), s = left % 60
    document.getElementById('timerNum').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    document.getElementById('timerRing').style.strokeDashoffset = 351.9 * (1 - (timerTotal - left) / timerTotal)
    const { capturedEmails } = await chrome.storage.local.get('capturedEmails')
    updateInterceptCount((capturedEmails || []).length)
    if (left === 0) { clearInterval(timerInterval); document.getElementById('timerNum').textContent = '完成！'; setTimeout(() => endFocus(), 1500) }
  }, 1000)
}

function updateInterceptCount(n) {
  document.getElementById('activeIntercepts').textContent = `已攔截 ${n} 封`
  document.getElementById('shieldCount').textContent = n
}

// ── End focus ──────────────────────────────────────
async function endFocus() {
  clearInterval(timerInterval)
  const { token, focusState, capturedEmails = [] } = await chrome.storage.local.get(['token','focusState','capturedEmails'])
  if (focusState?.sessionId && token) {
    try {
      await fetch(`${API}/focus/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sessionId: focusState.sessionId })
      })
    } catch (e) {}
  }
  await chrome.storage.local.set({ isFocusing: false, focusState: null })
  chrome.runtime.sendMessage({ type: 'FORCE_CHECK' })
  setPill(false)
  show('breakView')
  loadBreakSummary(capturedEmails)
}

// ── Break summary ──────────────────────────────────
async function loadBreakSummary(emails) {
  const el = document.getElementById('summaryContent')

  if (!emails || emails.length === 0) {
    el.innerHTML = `<div style="color:#6b5e50;font-size:11px;text-align:center;padding:16px;">🎉 專注期間沒有信件進來</div>`
    return
  }

  el.innerHTML = `<div style="color:#6b5e50;font-size:10px;letter-spacing:0.1em;padding:8px 0;">Claude 整理中...</div>`
  const { token } = await chrome.storage.local.get('token')

  // 格式統一：content script 抓到的欄位叫 sender，API 要的叫 from
  const normalised = emails.map(e => ({
    from: e.sender || e.from || '未知寄件人',
    subject: e.subject || '（無主旨）',
    preview: e.preview || ''
  }))

  try {
    const res = await fetch(`${API}/ai/summarise-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ emails: normalised })
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()

    if (data.summary && typeof data.summary === 'object') {
      renderStructured(el, data.summary)
    } else {
      renderFallback(el, emails)
    }
  } catch (e) {
    renderFallback(el, emails)
  }
}

function renderStructured(el, s) {
  const row = (e, showSummary) =>
    `<div style="padding:7px 0;border-bottom:1px solid rgba(212,136,74,0.06);">
      <div style="color:#c9a96e;font-size:11px;">${e.from}</div>
      <div style="color:#8a7060;font-size:10px;margin-top:2px;">${e.subject}</div>
      ${showSummary && e.summary ? `<div style="color:#6b5e50;font-size:10px;margin-top:2px;line-height:1.5;">${e.summary}</div>` : ''}
    </div>`

  let html = ''

  if (s.urgent?.length) {
    html += `<div style="margin-bottom:10px;">
      <div style="font-size:9px;letter-spacing:0.2em;color:#e05050;margin-bottom:6px;">🔴 需要回覆 (${s.urgent.length})</div>
      ${s.urgent.map(e => row(e, true)).join('')}
    </div>`
  }
  if (s.todo?.length) {
    html += `<div style="margin-bottom:10px;">
      <div style="font-size:9px;letter-spacing:0.2em;color:#d4884a;margin-bottom:6px;">📋 待辦 (${s.todo.length})</div>
      ${s.todo.map(e => row(e, true)).join('')}
    </div>`
  }
  if (s.personal?.length) {
    html += `<div style="margin-bottom:10px;">
      <div style="font-size:9px;letter-spacing:0.2em;color:#6b9e6b;margin-bottom:6px;">👥 私人 (${s.personal.length})</div>
      ${s.personal.map(e => row(e, false)).join('')}
    </div>`
  }
  if (s.adsCount > 0) {
    html += `<div style="font-size:10px;color:#4a3e32;padding-top:4px;">📢 廣告 ${s.adsCount} 封（已略過）</div>`
  }

  el.innerHTML = html || `<div style="color:#6b5e50;font-size:11px;">分類完成，無特別事項</div>`
}

function renderFallback(el, emails) {
  // 沒有 AI 分類時，用 real-time urgency score 來顯示
  const catColor = { critical:'#e05050', important:'#d4884a', normal:'#c9a96e', social:'#6b5e50' }
  const catLabel = { critical:'🔴 危急', important:'🟠 重要', normal:'🟡 普通', social:'⚪ 社交' }

  el.innerHTML = emails.map(e => {
    const u = e.urgency
    const badge = u
      ? `<span style="font-size:9px;color:${catColor[u.category]||'#6b5e50'};">${catLabel[u.category]||''} · ${u.score}分</span>`
      : ''
    return `<div style="padding:7px 0;border-bottom:1px solid rgba(212,136,74,0.06);">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="color:#c9a96e;font-size:11px;">${e.sender || e.from || '未知'}</div>
        ${badge}
      </div>
      <div style="color:#8a7060;font-size:10px;margin-top:2px;">${e.subject || '（無主旨）'}</div>
      ${u?.reason ? `<div style="color:#6b5e50;font-size:10px;margin-top:2px;">${u.reason}</div>` : ''}
    </div>`
  }).join('')
}

// ── Continue / Logout ──────────────────────────────
async function continueFromBreak() {
  await chrome.runtime.sendMessage({ type: 'CLEAR_EMAILS' })
  document.getElementById('goalInput').value = ''
  show('setupView')
}
async function logout() {
  clearInterval(timerInterval)
  await chrome.runtime.sendMessage({ type: 'LOGOUT' })
  document.getElementById('logoutBtn').style.display = 'none'
  setPill(false)
  show('loginView')
}

// ── Utils ──────────────────────────────────────────
function show(viewId) {
  ;['loginView','setupView','activeView','breakView'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.display = id === viewId ? 'block' : 'none'
  })
}
function setPill(active) {
  const pill = document.getElementById('statusPill')
  pill.textContent = active ? '🛡 封鎖中' : '待機'
  pill.classList.toggle('active', active)
}
function showErr(el, msg) { el.textContent = msg; el.style.display = 'block' }
function openSite() { chrome.tabs.create({ url: 'http://localhost:3000' }) }
