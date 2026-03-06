/**
 * Zen Capsule — Preload Script
 * Exposes safe IPC bridge to renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zenAPI', {
  // State
  getState: () => ipcRenderer.invoke('get-state'),
  onStateUpdate: (callback) => {
    ipcRenderer.on('focus-state-update', (_, state) => callback(state));
  },

  // Auth
  getToken: () => ipcRenderer.invoke('get-token'),
  saveToken: (token) => ipcRenderer.invoke('save-token', token),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  getUser: () => ipcRenderer.invoke('get-user'),
  saveUser: (user) => ipcRenderer.invoke('save-user', user),

  // Focus
  startFocus: (opts) => ipcRenderer.invoke('start-focus', opts),
  // Note: no stopFocus — lockdown mode
});
