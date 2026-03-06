let timerInterval = null

document.addEventListener('DOMContentLoaded', async () => {
  const { isFocusing, focusState, capturedEmails = [] } = await chrome.storage.local.get([
    'isFocusing', 'focusState', 'capturedEmails'
  ])

  if (!isFocusing || !focusState) {
    // Not in focus — show go-to-gmail option
    document.getElementById('focusView').style.display = 'none'
    document.getElementById('noFocusView').style.display = 'block'
    document.getElementById('goToGmail').addEventListener('click', () => {
      chrome.storage.local.set({ gmailOverride: true }, () => {
        window.location.href = 'https://mail.google.com'
      })
    })
    return
  }

  // In focus — show block screen
  document.getElementById('goalText').textContent = focusState.currentGoal || '專注中'
  document.getElementById('interceptCount').textContent = capturedEmails.length

  // Countdown timer
  const endTime = new Date(focusState.startedAt).getTime() + focusState.durationMinutes * 60 * 1000
  const totalSecs = focusState.durationMinutes * 60

  function tick() {
    const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
    const m = Math.floor(left / 60), s = left % 60
    document.getElementById('timerDisplay').textContent =
      `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    if (left === 0) clearInterval(timerInterval)
  }
  tick()
  timerInterval = setInterval(tick, 1000)

  // Override flow
  document.getElementById('overrideBtn').addEventListener('click', () => {
    document.getElementById('overrideConfirm').style.display = 'block'
    document.getElementById('overrideBtn').style.display = 'none'
  })
  document.getElementById('cancelOverride').addEventListener('click', () => {
    document.getElementById('overrideConfirm').style.display = 'none'
    document.getElementById('overrideBtn').style.display = 'block'
  })
  document.getElementById('confirmOverride').addEventListener('click', () => {
    // Temporarily disable block rule and go to Gmail
    chrome.runtime.sendMessage({ type: 'GMAIL_OVERRIDE' }, () => {
      window.location.href = 'https://mail.google.com'
    })
  })
})
