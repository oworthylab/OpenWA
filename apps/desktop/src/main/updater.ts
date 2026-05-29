/**
 * Auto-updater scaffold (US-046).
 *
 * Thin wrapper around `electron-updater` that translates its events into
 * the renderer-facing {@link DesktopUpdateStatus} broadcast. Updates are
 * published to GitHub Releases (see `electron-builder.yml` `publish`).
 *
 * **Sprint 5 status:** wired through the typed event surface. End-to-end
 * release pipeline (code signing, notarisation, release automation) is
 * deferred to Sprint 6 per the sprint review.
 */

import type { DesktopUpdateStatus, IpcEventChannel, IpcEventPayload } from '@openwa/shared/desktop';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

export interface UpdaterControllerOptions {
  broadcast: <C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>) => void;
  /** When false, skips check-on-launch and disables periodic polling. */
  isEnabled: () => boolean;
}

export class UpdaterController {
  private lastStatus: DesktopUpdateStatus = { state: 'idle' };
  private wired = false;

  constructor(private readonly opts: UpdaterControllerOptions) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  }

  /** Subscribe to electron-updater events. Idempotent. */
  wire(): void {
    if (this.wired) return;
    this.wired = true;
    autoUpdater.on('checking-for-update', () => this.emit({ state: 'checking' }));
    autoUpdater.on('update-available', (info: UpdateInfo) =>
      this.emit({ state: 'available', version: info.version }),
    );
    autoUpdater.on('update-not-available', () => this.emit({ state: 'no-update' }));
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
      this.emit({ state: 'downloading', progress: progress.percent }),
    );
    autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
      this.emit({ state: 'ready', version: info.version }),
    );
    autoUpdater.on('error', (err: Error) => this.emit({ state: 'error', message: err.message }));
  }

  async checkNow(): Promise<DesktopUpdateStatus> {
    if (!this.opts.isEnabled()) {
      return { state: 'idle' };
    }
    this.wire();
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.emit({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    return this.lastStatus;
  }

  installNow(): void {
    if (this.lastStatus.state !== 'ready') return;
    autoUpdater.quitAndInstall();
  }

  status(): DesktopUpdateStatus {
    return this.lastStatus;
  }

  private emit(status: DesktopUpdateStatus): void {
    this.lastStatus = status;
    this.opts.broadcast('updater:status', status);
  }
}
