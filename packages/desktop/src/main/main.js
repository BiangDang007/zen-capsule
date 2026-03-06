/**
 * Zen Capsule Desktop — Main Process
 *
 * Menu bar / tray app for macOS (and Windows system tray).
 * Manages focus sessions with system-level domain blocking.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  Notification,
} = require('electron');
const path = require('path');
const Store = require('electron-store');
const focusEngine = require('./focus-engine');
const { emergencyCleanup } = require('./hosts-blocker');

const store = new Store({ name: 'zen-capsule-state' });

let tray = null;
let mainWindow = null;

// ─── App Lifecycle ─────────────────────────────────────

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Hide dock icon on macOS (menu bar app style)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

app.whenReady().then(() => {
  createTray();
  createWindow();

  // Listen for focus state updates → update tray
  focusEngine.onUpdate((state) => {
    updateTrayTitle(state);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('focus-state-update', state);
    }
  });
});

// Emergency cleanup on quit
app.on('before-quit', async (e) => {
  // Only cleanup if focus is NOT active (lockdown mode means no quitting during focus)
  const state = focusEngine.getState();
  if (state.isActive) {
    e.preventDefault();
    new Notification({
      title: '🔒 Zen Capsule — Locked',
      body: `Focus session active. ${formatTime(state.remainingSeconds)} remaining. Cannot quit.`,
    }).show();
    return;
  }
});

app.on('will-quit', async () => {
  await emergencyCleanup();
});

// ─── Tray ──────────────────────────────────────────────

function createTray() {
  // Create a simple tray icon (use emoji text for now, replace with icon later)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  tray.setTitle('🧘');
  tray.setToolTip('Zen Capsule');

  tray.on('click', () => {
    toggleWindow();
  });

  updateTrayMenu();
}

function updateTrayTitle(state) {
  if (!tray) return;

  if (state?.isActive) {
    const time = formatTime(state.remainingSeconds);
    tray.setTitle(`🛡 ${time}`);
    tray.setToolTip(`Zen Capsule — Focusing (${time} left)`);
  } else {
    tray.setTitle('🧘');
    tray.setToolTip('Zen Capsule — Ready');
  }
  updateTrayMenu();
}

function updateTrayMenu() {
  const state = focusEngine.getState();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: state.isActive
        ? `🛡 Focusing — ${formatTime(state.remainingSeconds)}`
        : '🧘 Zen Capsule',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (state.isActive) {
          new Notification({
            title: '🔒 Cannot Quit',
            body: 'Focus session is active. Wait for timer to expire.',
          }).show();
        } else {
          app.quit();
        }
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

// ─── Window ────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    positionWindow();
    mainWindow.show();
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindow();
    mainWindow.show();
    mainWindow.focus();
  }
}

function positionWindow() {
  if (!tray || !mainWindow) return;
  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  mainWindow.setPosition(x, y);
}

// ─── IPC Handlers ──────────────────────────────────────

ipcMain.handle('get-state', () => {
  return focusEngine.getState();
});

ipcMain.handle('get-token', () => {
  return store.get('token', null);
});

ipcMain.handle('save-token', (_, token) => {
  store.set('token', token);
  return true;
});

ipcMain.handle('clear-token', () => {
  store.delete('token');
  store.delete('user');
  return true;
});

ipcMain.handle('save-user', (_, user) => {
  store.set('user', user);
  return true;
});

ipcMain.handle('get-user', () => {
  return store.get('user', null);
});

ipcMain.handle('start-focus', async (_, { durationMinutes, goal }) => {
  const token = store.get('token');
  return await focusEngine.startFocus({ durationMinutes, goal, token });
});

// Note: NO 'stop-focus' handler. Lockdown mode = timer only.

// ─── Helpers ───────────────────────────────────────────

function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return '00:00';
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
