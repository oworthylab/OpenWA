/**
 * Persisted desktop user settings.
 *
 * Stored as JSON in `userData/settings.json`. The schema is mirrored in
 * the {@link DesktopSettings} IPC contract so the renderer can read/write
 * it without parsing concerns. Keep the shape backward-compatible —
 * missing fields fall back to {@link DEFAULT_SETTINGS}.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DesktopSettings } from '@openwa/shared/desktop';

export const DEFAULT_SETTINGS: DesktopSettings = {
  minimizeToTray: true,
  notificationsEnabled: true,
  notificationSound: true,
  autoUpdate: true,
  launchOnStartup: false,
};

export class SettingsStore {
  private cached: DesktopSettings;

  constructor(private readonly filePath: string) {
    this.cached = this.load();
  }

  get(): DesktopSettings {
    return { ...this.cached };
  }

  update(patch: Partial<DesktopSettings>): DesktopSettings {
    this.cached = { ...this.cached, ...patch };
    this.persist();
    return { ...this.cached };
  }

  private load(): DesktopSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DesktopSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.cached, null, 2), 'utf8');
  }
}
