/**
 * Native OS notifications scaffold (US-045).
 *
 * Wraps Electron's {@link Notification} so the rest of the app can fire
 * notifications without knowing whether the OS supports them. Clicks
 * fan out via the typed IPC bus so the renderer can route the user to
 * the right chat.
 */

import type {
  DesktopNotificationInput,
  IpcEventChannel,
  IpcEventPayload,
} from '@openwa/shared/desktop';
import { Notification } from 'electron';

export interface NotificationCenterOptions {
  broadcast: <C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>) => void;
  /** When false, `notify` becomes a no-op (settings opt-out). */
  isEnabled: () => boolean;
  /** When false, suppresses sound across all notifications. */
  soundEnabled: () => boolean;
}

export class NotificationCenter {
  constructor(private readonly opts: NotificationCenterOptions) {}

  notify(input: DesktopNotificationInput): void {
    if (!this.opts.isEnabled()) return;
    if (!Notification.isSupported()) return;
    const silent = input.silent ?? !this.opts.soundEnabled();
    const n = new Notification({
      title: input.title,
      body: input.body,
      silent,
    });
    n.on('click', () => {
      const payload: IpcEventPayload<'notification:click'> = {};
      if (input.notificationId !== undefined) payload.notificationId = input.notificationId;
      if (input.sessionId !== undefined) payload.sessionId = input.sessionId;
      if (input.chatJid !== undefined) payload.chatJid = input.chatJid;
      this.opts.broadcast('notification:click', payload);
    });
    n.show();
  }
}
