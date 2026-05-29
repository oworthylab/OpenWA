// Preload for the SHELL window (sidebar / chrome). Exposes a tiny
// `window.openwa` API the shell.html can use to manage accounts.
//
// Runs with `contextIsolation: true` so renderer code can't touch
// Node directly — only via these explicit IPC channels.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openwa', {
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    active: () => ipcRenderer.invoke('accounts:active'),
    activate: (id) => ipcRenderer.invoke('accounts:activate', id),
    add: () => ipcRenderer.invoke('accounts:add'),
    rename: (id, name) => ipcRenderer.invoke('accounts:rename', id, name),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
  },
  on: (channel, fn) => {
    const allowed = ['accounts:active'];
    if (!allowed.includes(channel)) return () => {};
    const handler = (_event, ...args) => fn(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
