/**
 * Zen Capsule Desktop — Renderer (UI Logic)
 */

const API_URL = 'http://localhost:3000/api/v1';

// ─── DOM Elements ──────────────────────────────────────
const views = {
  login: document.getElementById('loginView'),
  setup: document.getElementById('setupView'),
  focus: document.getElementById('focusView'),
  complete: document.getElementById('completeView'),
};

// Login
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const toggleAuth = document.getElementById('toggleAuth');
const loginError = document.getElementById('loginError');

// Setup
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const presetBtns = document.querySelectorAll('.preset-btn');
const goalInput = document.getElementById('goalInput');
const startBtn = document.getElementById('startBtn');

// Focus
const timerText = document.getElementById('timerText');
const focusGoal = document.getElementById('focusGoal');
const interceptCount = document.getElementById('interceptCount');

// Complete
const statDuration = document.getElementById('statDuration');
const statBlocked = document.getElementById('statBlocked');
const completeSummary = document.getElementById('completeSummary');
const doneBtn = document.getElementById('doneBtn');

// ─── State ─────────────────────────────────────────────
let isRegisterMode = false;
let selectedMinutes = 45;
let lastCompletedState = null;

// ─── View Management ───────────────────────────────────
function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
}

// ─── Init ──────────────────────────────────────────────
async function init() {
  const [state, user] = await Promise.all([
    window.zenAPI.getState(),
    window.zenAPI.getUser(),
  ]);

  if (state.isActive) {
    showFocusView(state);
  } else if (state.remainingSeconds === 0 && state.durationMinutes > 0 && !state.isActive) {
    // Just completed
    showCompleteView(state);
  } else if (user) {
    userEmail.textContent = user.email;
    showView('setup');
  } else {
    showView('login');
  }
}

// ─── Listen for real-time state updates from main process ──
window.zenAPI.onStateUpdate((state) => {
  if (state.isActive) {
    updateTimer(state);
  } else if (lastCompletedState === null || lastCompletedState.isActive) {
    // Transition from active → complete
    showCompleteView(state);
  }
  lastCompletedState = state;
});

// ─── Login / Register ──────────────────────────────────
toggleAuth.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  loginBtn.textContent = isRegisterMode ? 'Sign Up' : 'Sign In';
  toggleAuth.textContent = isRegisterMode
    ? 'Already have an account? Sign In'
    : "Don't have an account? Sign Up";
  loginError.textContent = '';
});

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    loginError.textContent = 'Please enter email and password';
    return;
  }

  loginBtn.disabled = true;
  loginError.textContent = '';

  try {
    const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    await window.zenAPI.saveToken(data.accessToken);
    await window.zenAPI.saveUser(data.user);
    userEmail.textContent = data.user.email;
    showView('setup');
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginBtn.disabled = false;
  }
});

// Enter key to submit
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

// ─── Logout ────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  await window.zenAPI.clearToken();
  emailInput.value = '';
  passwordInput.value = '';
  showView('login');
});

// ─── Duration Presets ──────────────────────────────────
presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    presetBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMinutes = parseInt(btn.dataset.min);
  });
});

// ─── Start Focus ───────────────────────────────────────
startBtn.addEventListener('click', async () => {
  const goal = goalInput.value.trim() || 'Deep focus session';

  startBtn.disabled = true;
  startBtn.textContent = 'Locking down...';

  try {
    const state = await window.zenAPI.startFocus({
      durationMinutes: selectedMinutes,
      goal,
    });
    showFocusView(state);
  } catch (err) {
    alert(`Failed to start: ${err.message}`);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = '🧘 Start Focus — Lock Down';
  }
});

// ─── Focus View ────────────────────────────────────────
function showFocusView(state) {
  showView('focus');
  focusGoal.textContent = state.goal || '';
  updateTimer(state);
}

function updateTimer(state) {
  timerText.textContent = formatTime(state.remainingSeconds);
  const count = state.interceptedNotifications?.length || 0;
  interceptCount.textContent = count > 0
    ? `🛡 ${count} notifications blocked`
    : '';
}

// ─── Complete View ─────────────────────────────────────
function showCompleteView(state) {
  showView('complete');
  statDuration.textContent = `${state.durationMinutes}m`;
  statBlocked.textContent = state.interceptedNotifications?.length || 0;
  completeSummary.textContent = `You stayed focused for ${state.durationMinutes} minutes. All blocks have been removed.`;
}

doneBtn.addEventListener('click', () => {
  goalInput.value = '';
  showView('setup');
});

// ─── Helpers ───────────────────────────────────────────
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return '00:00';
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Boot ──────────────────────────────────────────────
init();
