const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  WebContentsView,
  Tray,
  Menu,
  nativeImage,
  session,
  shell,
  ipcMain,
  Notification,
} = require('electron');

// -------------- single-instance lock --------------
// Without this, double-clicking the icon would spawn a second copy
// that tries to bind the same partition data dirs — leads to QR loops
// and "session locked" errors.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// -------------- persistent state --------------
const userDataDir = app.getPath('userData');
const accountsFile = path.join(userDataDir, 'accounts.json');

function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  } catch {
    return [{ id: 'default', name: 'Account 1' }];
  }
}
function saveAccounts(accounts) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
}

// Each account → one persistent session partition. The string
// `persist:<id>` tells Chromium to keep cookies, localStorage, IndexedDB,
// service workers, etc. across app restarts. Switching to a different
// partition string creates a fresh, completely isolated browser context.
function partitionFor(accountId) {
  return `persist:openwa-${accountId}`;
}

// WhatsApp Web sniffs the UA and refuses to load on anything that
// doesn't look like a recent Chrome on a desktop OS. Electron's default
// UA includes "Electron/x.y.z" which has historically been blocked.
// We strip it and present as plain Chrome.
const WA_URL = 'https://web.whatsapp.com/';
const CHROME_UA = (() => {
  const ua = app.userAgentFallback || '';
  return ua.replace(/\s*Electron\/[^\s]+/, '').replace(/\s*OpenWA\/[^\s]+/, '');
})();

// -------------- main window --------------
let win = null;
let tray = null;
let unreadTotal = 0;
const accountViews = new Map(); // id → WebContentsView
let activeAccountId = null;

function loadShellHtml(window) {
  window.loadFile(path.join(__dirname, 'shell.html'));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0b141a',
    title: 'OpenWA',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // The shell is a tiny native page that hosts the account switcher
  // sidebar; WhatsApp itself lives in a WebContentsView positioned to
  // the right of it. This keeps the sidebar reactive (we render it from
  // the main process via IPC) without WhatsApp's CSP interfering.
  loadShellHtml(win);

  win.on('close', (event) => {
    // Hide-to-tray instead of quitting so notifications keep working
    // and re-opening is instant. Real quit is via tray menu / Cmd+Q.
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  // Reposition embedded WhatsApp view whenever the shell resizes.
  win.on('resize', layoutActiveView);
  win.on('maximize', layoutActiveView);
  win.on('unmaximize', layoutActiveView);
  win.on('enter-full-screen', layoutActiveView);
  win.on('leave-full-screen', layoutActiveView);
}

// Sidebar is 72 px wide; WA view takes the rest of the window.
const SIDEBAR_WIDTH = 72;
function layoutActiveView() {
  if (!win) return;
  const view = accountViews.get(activeAccountId);
  if (!view) return;
  const { width, height } = win.getContentBounds();
  view.setBounds({
    x: SIDEBAR_WIDTH,
    y: 0,
    width: Math.max(0, width - SIDEBAR_WIDTH),
    height,
  });
}

function ensureAccountView(account) {
  if (accountViews.has(account.id)) return accountViews.get(account.id);

  const sess = session.fromPartition(partitionFor(account.id));
  sess.setUserAgent(CHROME_UA);

  // Notifications: WhatsApp Web uses the Web Notifications API. Electron
  // surfaces those automatically; we just need permission granted.
  sess.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'notifications' || permission === 'media') return callback(true);
    callback(false);
  });

  const view = new WebContentsView({
    webPreferences: {
      session: sess,
      preload: path.join(__dirname, 'wa-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Open external links (e.g. https://… in a chat) in the system browser
  // instead of swallowing them in the WA view.
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('https://web.whatsapp.com')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  view.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://web.whatsapp.com')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  view.webContents.loadURL(WA_URL, { userAgent: CHROME_UA });

  accountViews.set(account.id, view);
  return view;
}

function activateAccount(accountId) {
  if (!win) return;
  const accounts = loadAccounts();
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  if (!account) return;

  const view = ensureAccountView(account);

  // Swap which view is attached to the window.
  for (const v of accountViews.values()) {
    try {
      win.contentView.removeChildView(v);
    } catch {
      /* not attached */
    }
  }
  win.contentView.addChildView(view);
  activeAccountId = account.id;
  layoutActiveView();
  win.webContents.send('accounts:active', activeAccountId);
}

// -------------- tray --------------
function buildTrayMenu() {
  const accounts = loadAccounts();
  return Menu.buildFromTemplate([
    {
      label: 'Show OpenWA',
      click: () => {
        win?.show();
        win?.focus();
      },
    },
    { type: 'separator' },
    ...accounts.map((a) => ({
      label: a.name,
      type: 'radio',
      checked: a.id === activeAccountId,
      click: () => {
        win?.show();
        activateAccount(a.id);
      },
    })),
    { type: 'separator' },
    { label: `Unread: ${unreadTotal}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('OpenWA');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    win?.isVisible() ? win.hide() : win?.show();
  });
}

function refreshTray() {
  tray?.setContextMenu(buildTrayMenu());
}

// -------------- IPC from shell.html sidebar --------------
ipcMain.handle('accounts:list', () => loadAccounts());
ipcMain.handle('accounts:active', () => activeAccountId);
ipcMain.handle('accounts:activate', (_e, id) => {
  activateAccount(id);
  return activeAccountId;
});
ipcMain.handle('accounts:add', () => {
  const accounts = loadAccounts();
  const id = `acct-${Date.now().toString(36)}`;
  const name = `Account ${accounts.length + 1}`;
  accounts.push({ id, name });
  saveAccounts(accounts);
  activateAccount(id);
  refreshTray();
  return { id, name };
});
ipcMain.handle('accounts:rename', (_e, id, name) => {
  const accounts = loadAccounts();
  const a = accounts.find((x) => x.id === id);
  if (a) {
    a.name = name;
    saveAccounts(accounts);
    refreshTray();
  }
  return accounts;
});
ipcMain.handle('accounts:remove', async (_e, id) => {
  const accounts = loadAccounts();
  const remaining = accounts.filter((a) => a.id !== id);
  if (remaining.length === 0) return accounts; // never delete last
  saveAccounts(remaining);
  // Wipe the partition data so the next login starts fresh.
  try {
    const sess = session.fromPartition(partitionFor(id));
    await sess.clearStorageData();
  } catch {
    /* best-effort */
  }
  const view = accountViews.get(id);
  if (view) {
    try {
      win?.contentView.removeChildView(view);
    } catch {}
    accountViews.delete(id);
  }
  if (activeAccountId === id) activateAccount(remaining[0].id);
  refreshTray();
  return remaining;
});

// Unread-count beacon from the wa-preload.js script.
ipcMain.on('wa:unread', (event, count) => {
  let total = 0;
  for (const [, view] of accountViews) {
    if (view.webContents.id === event.sender.id) {
      view.__unread = count;
    }
    total += view.__unread || 0;
  }
  unreadTotal = total;
  if (process.platform === 'darwin') app.dock?.setBadge(total > 0 ? String(total) : '');
  win?.setOverlayIcon(null, total > 0 ? `${total} unread` : '');
  refreshTray();
});

// Notification fan-through (some WAs route via this on Linux).
ipcMain.on('wa:notify', (_e, title, body) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.on('click', () => {
    win?.show();
    win?.focus();
  });
  n.show();
});

// -------------- lifecycle --------------
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Force a real-Chrome UA application-wide (covers fetches before any
  // partition is created).
  app.userAgentFallback = CHROME_UA;

  createWindow();
  createTray();

  // First account is auto-activated; subsequent ones are user-driven.
  const accounts = loadAccounts();
  activateAccount(accounts[0].id);
});

app.on('window-all-closed', () => {
  // On macOS apps typically stay alive until Cmd+Q. On Linux/Win we
  // also stay alive (hide-to-tray) so notifications keep coming.
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
