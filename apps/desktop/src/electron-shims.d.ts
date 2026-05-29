/**
 * Local shims for the Electron APIs the desktop app touches.
 *
 * We intentionally do not depend on Electron's `@types` packages at the
 * monorepo level so that `bun install` works in environments where the
 * Electron native module can't build (dev containers, CI workers without
 * X libs). When the user installs Electron locally, the real types take
 * precedence via TypeScript's `node_modules` resolution.
 *
 * These shims declare only the surface the app actually uses — anything
 * else falls back to `unknown` rather than `any`, so accidental drift
 * surfaces as a compile error.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'electron' {
  export interface IpcMainInvokeEvent {
    sender: WebContents;
  }
  export interface IpcMainEvent {
    sender: WebContents;
    reply(channel: string, ...args: unknown[]): void;
  }
  export interface IpcRendererEvent {}

  export interface BrowserWindow {
    loadURL(url: string): Promise<void>;
    loadFile(path: string): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
    show(): void;
    hide(): void;
    focus(): void;
    isVisible(): boolean;
    isMinimized(): boolean;
    restore(): void;
    webContents: WebContents;
    setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): void;
    getBounds(): { x: number; y: number; width: number; height: number };
  }

  export interface WebContents {
    send(channel: string, ...args: unknown[]): void;
  }

  export interface Tray {
    setImage(image: unknown): void;
    setToolTip(text: string): void;
    setContextMenu(menu: Menu): void;
    on(event: string, listener: (...args: unknown[]) => void): this;
    destroy(): void;
  }

  export interface Menu {
    popup(opts?: unknown): void;
  }

  export interface MenuItemConstructorOptions {
    label?: string;
    type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
    enabled?: boolean;
    checked?: boolean;
    submenu?: MenuItemConstructorOptions[] | Menu;
    click?: () => void;
  }

  export interface NotificationConstructorOptions {
    title: string;
    body: string;
    silent?: boolean;
    icon?: string;
  }

  export interface Notification {
    show(): void;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export const app: {
    getName(): string;
    getVersion(): string;
    getPath(name: string): string;
    quit(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    whenReady(): Promise<void>;
    requestSingleInstanceLock(): boolean;
    setLoginItemSettings(settings: { openAtLogin: boolean }): void;
  };

  export const ipcMain: {
    // biome-ignore lint/suspicious/noExplicitAny: spread types in Electron IPC payloads can't be safely narrowed
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void;
    on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void;
    removeHandler(channel: string): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): void;
    removeListener(
      channel: string,
      listener: (event: IpcRendererEvent, ...args: unknown[]) => void,
    ): void;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  };

  export const BrowserWindow: {
    new (opts?: unknown): BrowserWindow;
    getAllWindows(): BrowserWindow[];
  };

  export const Tray: { new (image: unknown): Tray };
  export const Menu: {
    buildFromTemplate(template: MenuItemConstructorOptions[]): Menu;
    setApplicationMenu(menu: Menu | null): void;
  };
  export const Notification: {
    new (opts: NotificationConstructorOptions): Notification;
    isSupported(): boolean;
  };
  export const nativeImage: {
    createFromPath(path: string): unknown;
    createEmpty(): unknown;
  };
  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(plaintext: string): Buffer;
    decryptString(ciphertext: Buffer): string;
  };
  export const shell: {
    openExternal(url: string): Promise<void>;
  };
}

declare module 'electron-updater' {
  export interface UpdateInfo {
    version: string;
  }
  export interface ProgressInfo {
    percent: number;
  }
  export const autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    checkForUpdates(): Promise<unknown>;
    downloadUpdate(): Promise<void>;
    quitAndInstall(): void;
    // biome-ignore lint/suspicious/noExplicitAny: electron-updater event args vary per channel
    on(event: string, listener: (...args: any[]) => void): void;
  };
}
