// Zen Capsule — Web 體驗版主控台
// CSP-safe：無 inline handler；所有動態文字一律 textContent（防 XSS）。
(function () {
  'use strict'

  // 同源部署：後端同時 serve 本頁與 API，相對路徑在 dev / production 都正確
  const API = '/api/v1'

  const $ = (id) => document.getElementById(id)

  // ── Token 管理 ─────────────────────────────────────
  const store = {
    get token() { return localStorage.getItem('zc_token') },
    get refresh() { return localStorage.getItem('zc_refresh') },
    get email() { return localStorage.getItem('zc_email') || '' },
    save(access, refresh, email) {
      localStorage.setItem('zc_token', access)
      if (refresh) localStorage.setItem('zc_refresh', refresh)
      if (email) localStorage.setItem('zc_email', email)
    },
    clear() {
      localStorage.removeItem('zc_token')
      localStorage.removeItem('zc_refresh')
      localStorage.removeItem('zc_email')
    },
  }

  function parseError(data) {
    const err = data && data.error
    if (!err) return '發生未知錯誤，請稍後再試'
    if (typeof err === 'string') return err
    if (err.fieldErrors) return Object.values(err.fieldErrors).flat().join('、')
    return JSON.stringify(err)
  }

  // 帶 token 的 fetch；401 時自動用 refresh token 換新並重試一次
  async function apiFetch(path, options, retried) {
    const opts = Object.assign({ headers: {} }, options)
    opts.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options && options.headers,
      store.token ? { Authorization: 'Bearer ' + store.token } : {}
    )
    const res = await fetch(API + path, opts)
    if (res.status === 401 && !retried && store.refresh) {
      const ok = await tryRefresh()
      if (ok) return apiFetch(path, options, true)
      logout()
      throw new Error('登入已過期，請重新登入')
    }
    return res
  }

  async function tryRefresh() {
    try {
      const res = await fetch(API + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: store.refresh }),
      })
      if (!res.ok) return false
      const data = await res.json()
      store.save(data.accessToken, data.refreshToken)
      return true
    } catch { return false }
  }

  // ── 視圖切換 ───────────────────────────────────────
  function showAuth() {
    $('authView').hidden = false
    $('appView').hidden = true
  }
  function showApp() {
    $('authView').hidden = true
    $('appView').hidden = false
    $('userEmail').textContent = store.email
    loadBilling()
    loadStats()
  }
  function logout() {
    store.clear()
    clearInterval(timerInterval)
    clearInterval(breakInterval)
    showAuth()
  }

  function setMsg(el, text, type) {
    el.textContent = text
    el.classList.remove('error', 'ok')
    if (text) {
      el.classList.add('show', type || 'ok')
    } else {
      el.classList.remove('show')
    }
  }

  // ── 登入 / 註冊 ────────────────────────────────────
  let authMode = 'login'
  function setTab(mode) {
    authMode = mode
    $('tabLogin').classList.toggle('active', mode === 'login')
    $('tabRegister').classList.toggle('active', mode === 'register')
    $('tabLogin').setAttribute('aria-selected', String(mode === 'login'))
    $('tabRegister').setAttribute('aria-selected', String(mode === 'register'))
    $('authSubmit').textContent = mode === 'login' ? '登入' : '建立帳號'
    $('authPassword').setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password')
    setMsg($('authMsg'), '')
  }

  async function submitAuth() {
    const email = $('authEmail').value.trim()
    const password = $('authPassword').value
    if (!email || !password) return setMsg($('authMsg'), '請填入 email 和密碼', 'error')
    if (authMode === 'register' && password.length < 8) {
      return setMsg($('authMsg'), '密碼最少需要 8 個字元', 'error')
    }
    const btn = $('authSubmit')
    btn.disabled = true
    btn.textContent = '處理中...'
    try {
      const res = await fetch(API + '/auth/' + (authMode === 'login' ? 'login' : 'register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(parseError(data))
      store.save(data.accessToken, data.refreshToken, email)
      $('authPassword').value = ''
      showApp()
    } catch (e) {
      setMsg($('authMsg'), e.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = authMode === 'login' ? '登入' : '建立帳號'
    }
  }

  // ── 方案 / 用量 ────────────────────────────────────
  let userPlan = 'FREE'
  async function loadBilling() {
    try {
      const res = await apiFetch('/billing/status')
      if (!res.ok) return
      const data = await res.json()
      userPlan = data.plan || 'FREE'
      const chip = $('planChip')
      chip.textContent = userPlan
      chip.classList.toggle('pro', userPlan === 'PRO')
      $('proNotice').hidden = userPlan === 'PRO'
      if (data.today) {
        $('usageLine').textContent =
          '今日 AI 分析 ' + data.today.analyses.used + ' / ' + data.today.analyses.limit +
          ' 次 · 批次摘要 ' + data.today.summaries.used + ' / ' + data.today.summaries.limit + ' 次'
      }
    } catch { /* 靜默：用量顯示非關鍵 */ }
  }

  // ── 專注場次 ───────────────────────────────────────
  let focusDuration = 25
  let sessionId = null
  let timerInterval = null
  let breakInterval = null
  let timerTotal = 0
  let timerLeft = 0
  const RING_LEN = 464.96

  function pad(n) { return String(n).padStart(2, '0') }

  function renderTimer() {
    $('timerNum').textContent = pad(Math.floor(timerLeft / 60)) + ':' + pad(timerLeft % 60)
    $('timerBar').style.strokeDashoffset = String(RING_LEN * (1 - timerLeft / timerTotal))
  }

  function pickDuration(mins, fromCustom) {
    if (!mins || mins < 1) return
    focusDuration = Math.min(mins, 300)
    document.querySelectorAll('.dur-btn').forEach((b) => {
      b.classList.toggle('active', !fromCustom && Number(b.dataset.mins) === focusDuration)
    })
    if (!fromCustom) $('durCustom').value = ''
  }

  async function startFocus() {
    const goal = $('focusGoal').value.trim()
    if (!goal) return setMsg($('focusMsg'), '請輸入今天的目標', 'error')
    setMsg($('focusMsg'), '')
    try {
      const res = await apiFetch('/focus/start', { method: 'POST', body: JSON.stringify({ goal }) })
      const data = await res.json()
      if (!res.ok) throw new Error(parseError(data))
      sessionId = data.session.id
      $('focusSetup').hidden = true
      $('focusBreak').hidden = true
      $('focusActive').hidden = false
      $('activeGoal').textContent = '目標：' + goal
      $('activeIntercepts').textContent = '已攔截 0 次干擾'
      $('shieldCount').textContent = '0'
      timerTotal = focusDuration * 60
      timerLeft = timerTotal
      renderTimer()
      clearInterval(timerInterval)
      timerInterval = setInterval(() => {
        timerLeft--
        renderTimer()
        if (timerLeft <= 0) {
          clearInterval(timerInterval)
          $('timerNum').textContent = '完成！'
          endFocus()
        }
      }, 1000)
    } catch (e) {
      setMsg($('focusMsg'), e.message, 'error')
    }
  }

  async function endFocus() {
    clearInterval(timerInterval)
    if (!sessionId) return
    try {
      const res = await apiFetch('/focus/end', { method: 'POST', body: JSON.stringify({ sessionId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(parseError(data))
      const mins = Math.floor((data.session.durationSeconds || 0) / 60)
      const intercepts = data.session.interceptCount || 0
      $('focusActive').hidden = true
      $('focusBreak').hidden = false
      $('breakSummary').textContent =
        '本場專注 ' + mins + ' 分鐘，攔截 ' + intercepts + ' 次干擾。' +
        '在 Android App 上，被攔下的訊息會在這裡整理成回顧清單' +
        (userPlan === 'PRO' ? '，並由 AI 批次摘要。' : '。')
      let breakSecs = 5 * 60
      clearInterval(breakInterval)
      breakInterval = setInterval(() => {
        breakSecs--
        $('breakCount').textContent = '休息還剩 ' + pad(Math.floor(breakSecs / 60)) + ':' + pad(breakSecs % 60)
        if (breakSecs <= 0) {
          clearInterval(breakInterval)
          $('breakCount').textContent = '休息時間結束，準備好了嗎？'
        }
      }, 1000)
      sessionId = null
      loadStats()
    } catch (e) {
      // 結束失敗時回到設定畫面，避免卡死
      $('focusActive').hidden = true
      $('focusSetup').hidden = false
      setMsg($('focusMsg'), e.message, 'error')
    }
  }

  function restartFocus() {
    clearInterval(breakInterval)
    $('focusBreak').hidden = true
    $('focusSetup').hidden = false
    $('focusGoal').value = ''
  }

  // ── AI 緊急判斷 ────────────────────────────────────
  const CAT_LABEL = {
    critical: '🔴 CRITICAL · 危急',
    important: '🟠 IMPORTANT · 重要',
    normal: '🟡 NORMAL · 普通',
    social: '⚪ SOCIAL · 社交',
  }

  async function testUrgency() {
    const content = $('testMessage').value.trim()
    if (!content) return setMsg($('testMsg'), '請輸入訊息內容', 'error')
    setMsg($('testMsg'), '')
    const btn = $('testBtn')
    btn.disabled = true
    btn.textContent = '🤖 AI 分析中...'
    $('resultBox').classList.remove('show')
    try {
      const res = await apiFetch('/ai/analyse', {
        method: 'POST',
        body: JSON.stringify({
          content,
          senderName: $('testSender').value.trim() || undefined,
          senderContact: $('testContact').value.trim() || undefined,
          repeatCount: parseInt($('testRepeat').value, 10) || 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(parseError(data))
      const r = data.result
      const cat = String(r.category || 'normal')
      $('resultCat').textContent = CAT_LABEL[cat] || cat
      $('resultCat').className = 'result-cat cat-' + cat
      $('resultReason').textContent = r.reason || ''
      $('resultScore').textContent = String(r.score)
      $('resultScore').className = 'result-score cat-' + cat
      $('scoreFill').className = 'score-fill fill-' + cat
      $('scoreFill').style.width = Math.max(0, Math.min(100, Number(r.score) || 0)) + '%'
      $('verdictBreak').classList.toggle('show', !!r.shouldBreakthrough)
      $('verdictBlock').classList.toggle('show', !r.shouldBreakthrough)
      $('resultBox').classList.add('show')
      loadBilling()
    } catch (e) {
      setMsg($('testMsg'), e.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '🤖 讓 AI 判斷'
    }
  }

  // ── 統計 ───────────────────────────────────────────
  async function loadStats() {
    try {
      const res = await apiFetch('/sync/state')
      if (!res.ok) return
      const data = await res.json()
      const t = data.todayStats || {}
      $('statMinutes').textContent = String(t.totalMinutes ?? 0)
      $('statSessions').textContent = String(t.sessionsCount ?? 0)
      $('statIntercepts').textContent = String(t.totalInterceptions ?? 0)
    } catch { /* 靜默 */ }
  }

  // ── 事件繫結 ───────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    $('tabLogin').addEventListener('click', () => setTab('login'))
    $('tabRegister').addEventListener('click', () => setTab('register'))
    $('authSubmit').addEventListener('click', submitAuth)
    ;['authEmail', 'authPassword'].forEach((id) => {
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth() })
    })
    $('logoutBtn').addEventListener('click', logout)

    $('durRow').addEventListener('click', (e) => {
      const btn = e.target.closest('.dur-btn')
      if (btn) pickDuration(Number(btn.dataset.mins), false)
    })
    $('durCustom').addEventListener('input', (e) => {
      pickDuration(parseInt(e.target.value, 10) || 0, true)
    })
    $('startBtn').addEventListener('click', startFocus)
    $('endBtn').addEventListener('click', () => endFocus())
    $('restartBtn').addEventListener('click', restartFocus)

    $('testBtn').addEventListener('click', testUrgency)
    $('testMessage').addEventListener('keydown', (e) => { if (e.key === 'Enter') testUrgency() })
    $('refreshStats').addEventListener('click', () => { loadStats(); loadBilling() })

    // 自動還原 session
    if (store.token) {
      $('authEmail').value = store.email
      showApp()
    } else {
      showAuth()
    }
  })
})()
