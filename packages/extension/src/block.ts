import type { StoredFocusState, InterceptedEmail } from './types'

let timerInterval: ReturnType<typeof setInterval> | null = null

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['isFocusing', 'focusState', 'capturedEmails'])
  const isFocusing = stored.isFocusing as boolean | undefined
  const focusState = stored.focusState as StoredFocusState | null
  const capturedEmails = (stored.capturedEmails || []) as InterceptedEmail[]

  if (!isFocusing || !focusState) {
    document.getElementById('focusView')!.style.display = 'none'
    document.getElementById('noFocusView')!.style.display = 'block'
    document.getElementById('goToGmail')!.addEventListener('click', () => {
      chrome.storage.local.set({ gmailOverride: true }, () => {
        window.location.href = 'https://mail.google.com'
      })
    })
    return
  }

  document.getElementById('goalText')!.textContent = focusState.currentGoal || '專注中'
  document.getElementById('interceptCount')!.textContent = String(capturedEmails.length)

  const endTime = new Date(focusState.startedAt).getTime() + focusState.durationMinutes * 60 * 1000

  function tick(): void {
    const left = Math.max(0, Math.floor((endTime - Date.now()) / 1000))
    const m = Math.floor(left / 60), s = left % 60
    document.getElementById('timerDisplay')!.textContent =
      `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    if (left === 0 && timerInterval) clearInterval(timerInterval)
  }
  tick()
  timerInterval = setInterval(tick, 1000)

  document.getElementById('overrideBtn')!.addEventListener('click', () => {
    document.getElementById('overrideConfirm')!.style.display = 'block'
    document.getElementById('overrideBtn')!.style.display = 'none'
  })
  document.getElementById('cancelOverride')!.addEventListener('click', () => {
    document.getElementById('overrideConfirm')!.style.display = 'none'
    document.getElementById('overrideBtn')!.style.display = 'block'
  })
  document.getElementById('confirmOverride')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GMAIL_OVERRIDE' }, () => {
      window.location.href = 'https://mail.google.com'
    })
  })
})
