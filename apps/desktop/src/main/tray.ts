/**
 * System tray scaffold (US-045).
 *
 * Builds a tray icon with a context menu reflecting the live engine
 * state. The tray hides/shows the main window on click and lets users
 * quit the app without opening it.
 *
 * **Sprint 5 status:** scaffold only — relies on Electron APIs that
 * can't be exercised in the dev container. The function signatures are
 * stable so Sprint 6 can drop in real platform icons + click handlers.
 */

import { join } from 'node:path';
import type { DesktopSessionSummary } from '@openwa/shared/desktop';
import { SessionStatus } from '@openwa/shared/types';
import { Menu, Tray, app, nativeImage } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';

export interface TrayController {
  /** Updates the menu when the session list or statuses change. */
  refresh(sessions: DesktopSessionSummary[]): void;
  /** Disposes of the underlying tray icon. */
  destroy(): void;
}

export interface CreateTrayOptions {
  /** Main window — toggled by tray click. */
  window: BrowserWindow;
  /** Directory containing platform-specific tray icons (PNG/ICO/ICNS). */
  iconRoot: string;
  /** Called when the user picks "Quit" from the menu. */
  onQuit: () => void;
}

const STATUS_GLYPH: Record<SessionStatus, string> = {
  [SessionStatus.Pending]: '○',
  [SessionStatus.QrRequired]: '⎈',
  [SessionStatus.Pairing]: '⎈',
  [SessionStatus.Connecting]: '◐',
  [SessionStatus.Connected]: '●',
  [SessionStatus.Disconnected]: '○',
  [SessionStatus.LoggedOut]: '⊘',
  [SessionStatus.Failed]: '⚠',
};

export function createTray(opts: CreateTrayOptions): TrayController {
  const iconPath = join(opts.iconRoot, trayIconForPlatform());
  const image = safeLoadImage(iconPath);
  const tray = new Tray(image);
  tray.setToolTip(`${app.getName()} ${app.getVersion()}`);

  const toggleWindow = () => {
    if (opts.window.isVisible() && !opts.window.isMinimized()) {
      opts.window.hide();
    } else {
      if (opts.window.isMinimized()) opts.window.restore();
      opts.window.show();
      opts.window.focus();
    }
  };
  tray.on('click', toggleWindow);

  const setMenu = (sessions: DesktopSessionSummary[]): void => {
    const sessionItems: MenuItemConstructorOptions[] = sessions.map((s) => ({
      label: `${STATUS_GLYPH[s.status] ?? '·'}  ${s.name}`,
      enabled: false,
    }));
    const template: MenuItemConstructorOptions[] = [
      { label: 'Show OpenWA', click: toggleWindow },
      { type: 'separator' },
      ...(sessionItems.length > 0 ? sessionItems : [{ label: 'No sessions yet', enabled: false }]),
      { type: 'separator' },
      { label: 'Quit', click: opts.onQuit },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };
  setMenu([]);

  return {
    refresh: setMenu,
    destroy: () => tray.destroy(),
  };
}

function trayIconForPlatform(): string {
  switch (process.platform) {
    case 'darwin':
      return 'tray-mac.png';
    case 'win32':
      return 'tray-win.ico';
    default:
      return 'tray-linux.png';
  }
}

function safeLoadImage(path: string): unknown {
  try {
    return nativeImage.createFromPath(path);
  } catch {
    return nativeImage.createEmpty();
  }
}
