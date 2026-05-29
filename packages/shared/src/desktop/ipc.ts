/**
 * Typed IPC contract between the Electron main process and the renderer.
 *
 * Channels are grouped into namespaces:
 *  - `app:*`          general app lifecycle (version, quit, settings)
 *  - `session:*`      WhatsApp session lifecycle
 *  - `engine:*`       engine-wide events (status, errors)
 *  - `notification:*` outbound notifications + click handling
 *  - `updater:*`      auto-updater lifecycle
 *
 * `IpcInvokeMap` is the request → response shape for `ipcRenderer.invoke`
 * calls. `IpcEventMap` is the payload shape for fire-and-forget broadcasts
 * (`webContents.send`) from main → renderer.
 *
 * Both maps are exhaustive and type-checked at compile time. The desktop
 * preload script narrows these into a `window.openwa` object that the
 * renderer consumes.
 */

import type { PhoneE164, SessionId, WhatsAppJid } from '../types/brand.js';
import type { SessionStatus } from '../types/enums.js';

// -------------------- shared shapes --------------------

export interface DesktopSessionSummary {
  id: SessionId;
  name: string;
  status: SessionStatus;
  phoneNumber: PhoneE164 | null;
  pushName: string | null;
  lastConnectedAt: string | null;
  lastError: { code: string; message: string } | null;
}

export interface CreateDesktopSessionInput {
  name: string;
  /** Optional - if supplied, attempts pairing-code flow instead of QR. */
  phoneNumber?: PhoneE164;
}

export interface DesktopQrPayload {
  sessionId: SessionId;
  /** Raw QR payload as emitted by Baileys. Renderer encodes to image. */
  qr: string;
  /** Unix ms when this QR expires (Baileys rotates ~20s). */
  expiresAt: number;
}

export interface DesktopNotificationInput {
  title: string;
  body: string;
  /** Optional id; if supplied, click events carry it back. */
  notificationId?: string;
  /** Optional session for routing the click. */
  sessionId?: SessionId;
  /** Optional chat JID for routing the click. */
  chatJid?: WhatsAppJid;
  /** Silent suppresses sound. */
  silent?: boolean;
}

export interface DesktopAppInfo {
  version: string;
  /** Channel: stable / beta / dev. */
  channel: 'stable' | 'beta' | 'dev';
  platform: NodeJS.Platform;
  /** Path to the user's app data directory (logs / session creds). */
  userDataPath: string;
}

export interface DesktopUpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'no-update';
  /** Available version when state is `available` / `downloading` / `ready`. */
  version?: string;
  /** Download progress 0-100 when state is `downloading`. */
  progress?: number;
  /** Error message when state is `error`. */
  message?: string;
}

export interface DesktopSettings {
  /** Minimize to tray when the user closes the main window. */
  minimizeToTray: boolean;
  /** Show native OS notifications for incoming messages. */
  notificationsEnabled: boolean;
  /** Play a sound with notifications. */
  notificationSound: boolean;
  /** Auto-check for updates on launch + every 4h. */
  autoUpdate: boolean;
  /** Launch the app when the user logs into their OS. */
  launchOnStartup: boolean;
}

// -------------------- request/response (ipcRenderer.invoke) --------------------

/**
 * Channel → { request, response } map. Each handler in the main process
 * implements one entry; the preload bridge exposes a typed wrapper.
 */
export interface IpcInvokeMap {
  'app:getInfo': { request: void; response: DesktopAppInfo };
  'app:getSettings': { request: void; response: DesktopSettings };
  'app:updateSettings': { request: Partial<DesktopSettings>; response: DesktopSettings };
  'app:quit': { request: void; response: void };

  'session:list': { request: void; response: DesktopSessionSummary[] };
  'session:create': {
    request: CreateDesktopSessionInput;
    response: DesktopSessionSummary;
  };
  'session:start': { request: { id: SessionId }; response: DesktopSessionSummary };
  'session:stop': { request: { id: SessionId }; response: DesktopSessionSummary };
  'session:restart': { request: { id: SessionId }; response: DesktopSessionSummary };
  'session:remove': { request: { id: SessionId }; response: void };
  'session:logout': { request: { id: SessionId }; response: DesktopSessionSummary };
  'session:requestQr': { request: { id: SessionId }; response: { requested: boolean } };

  'updater:check': { request: void; response: DesktopUpdateStatus };
  'updater:installNow': { request: void; response: void };
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcRequest<C extends IpcInvokeChannel> = IpcInvokeMap[C]['request'];
export type IpcResponse<C extends IpcInvokeChannel> = IpcInvokeMap[C]['response'];

// -------------------- broadcast (webContents.send) --------------------

/**
 * Channel → payload map for one-way broadcasts from main → renderer.
 * The preload bridge exposes `on(channel, listener)` returning a dispose
 * fn (so renderer effects can clean up on unmount).
 */
export interface IpcEventMap {
  'session:status': DesktopSessionSummary;
  'session:qr': DesktopQrPayload;
  'session:removed': { id: SessionId };
  'engine:error': { sessionId: SessionId | null; code: string; message: string };
  'notification:click': {
    notificationId?: string;
    sessionId?: SessionId;
    chatJid?: WhatsAppJid;
  };
  'updater:status': DesktopUpdateStatus;
}

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventMap[C];
