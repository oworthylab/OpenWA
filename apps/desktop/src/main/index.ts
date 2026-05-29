/**
 * Electron main process entry point.
 *
 * Composes the desktop scaffold: session store + engine manager + IPC
 * handlers + tray + auto-updater. Each subsystem is independently
 * testable; this file is the wiring layer.
 *
 * **Sprint 5 status:** boots the app and wires every service end-to-end
 * against the typed contracts in `@openwa/shared/desktop`. Live testing
 * happens on a host OS in Sprint 6 — the dev container can't run
 * Electron or Baileys' native dependencies.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IpcEventChannel, IpcEventPayload } from '@openwa/shared/desktop';
import { BrowserWindow, app } from 'electron';
import { EngineManager } from './engine-manager.js';
import { registerIpcHandlers } from './ipc.js';
import { NotificationCenter } from './notifications.js';
import { SessionStore } from './session-store.js';
import { SettingsStore } from './settings.js';
import { type TrayController, createTray } from './tray.js';
import { UpdaterController } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RENDERER_DEV_URL = process.env.OPENWA_DESKTOP_DEV_URL ?? null;

let mainWindow: BrowserWindow | null = null;
let tray: TrayController | null = null;
let manager: EngineManager | null = null;

async function bootstrap(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();

  const userData = app.getPath('userData');
  const settings = new SettingsStore(join(userData, 'settings.json'));
  const store = new SessionStore({ filePath: join(userData, 'sessions.json') });
  const authRoot = join(userData, 'auth');

  mainWindow = createMainWindow();

  const broadcast = <C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>): void => {
    mainWindow?.webContents.send(channel, payload);
  };

  manager = new EngineManager({
    store,
    authRoot,
    broadcast: (channel, payload) => {
      broadcast(channel, payload);
      if (channel === 'session:status' || channel === 'session:removed') {
        tray?.refresh(manager?.list() ?? []);
      }
    },
  });

  const updater = new UpdaterController({
    broadcast,
    isEnabled: () => settings.get().autoUpdate,
  });

  // Notification center is exercised by future engine events in Sprint 6;
  // instantiate it here so the dependency graph is wired up.
  const notifications = new NotificationCenter({
    broadcast,
    isEnabled: () => settings.get().notificationsEnabled,
    soundEnabled: () => settings.get().notificationSound,
  });
  void notifications;

  registerIpcHandlers({ window: mainWindow, manager, settings, updater });

  const iconRoot = join(app.getPath('exe'), '..', 'resources', 'tray-icons');
  tray = createTray({
    window: mainWindow,
    iconRoot,
    onQuit: () => app.quit(),
  });
  tray.refresh(manager.list());

  if (settings.get().autoUpdate) {
    void updater.checkNow();
  }
  if (settings.get().launchOnStartup) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 740,
    show: true,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (RENDERER_DEV_URL) {
    void win.loadURL(RENDERER_DEV_URL);
  } else {
    void win.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  }
  return win;
}

app.on('before-quit', async () => {
  tray?.destroy();
  await manager?.shutdown();
});

void bootstrap();
