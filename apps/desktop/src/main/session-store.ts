/**
 * Persistent metadata for desktop sessions.
 *
 * Sprint 5 ships an in-memory store with a JSON snapshot file so the
 * scaffold compiles and unit-tests without a native sqlite dependency.
 * Sprint 6+ swap this for a `better-sqlite3` backed store (see
 * `peerDependencies` in `package.json`); the {@link SessionStore}
 * interface stays the same.
 *
 * No encryption is applied here — Baileys credentials live in
 * `authRoot/<sessionId>` and are protected by Electron's `safeStorage`
 * (added in Sprint 6 once the OS keychain integration is live).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PhoneE164, SessionId } from '@openwa/shared/types';

export interface SessionRecord {
  id: SessionId;
  name: string;
  phoneNumber: PhoneE164 | null;
  pushName: string | null;
  /** ISO 8601 timestamp of last successful auth. */
  lastConnectedAt: string | null;
  /** ISO 8601 timestamp of creation. */
  createdAt: string;
}

export interface CreateSessionInput {
  name: string;
  phoneNumber: PhoneE164 | null;
}

export interface UpdateSessionInput {
  phoneNumber?: PhoneE164 | null;
  pushName?: string | null;
  lastConnectedAt?: string | null;
}

export interface SessionStoreOptions {
  /** Absolute path to the JSON snapshot file. */
  filePath: string;
}

export class SessionStore {
  private records: SessionRecord[] = [];

  constructor(private readonly opts: SessionStoreOptions) {
    this.load();
  }

  list(): SessionRecord[] {
    return [...this.records];
  }

  get(id: SessionId): SessionRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  require(id: SessionId): SessionRecord {
    const r = this.get(id);
    if (!r) throw new Error(`Session not found: ${id}`);
    return r;
  }

  create(input: CreateSessionInput): SessionRecord {
    const record: SessionRecord = {
      id: randomUUID() as SessionId,
      name: input.name,
      phoneNumber: input.phoneNumber,
      pushName: null,
      lastConnectedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.records.push(record);
    this.persist();
    return record;
  }

  update(id: SessionId, patch: UpdateSessionInput): SessionRecord {
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error(`Session not found: ${id}`);
    const current = this.records[idx];
    if (!current) throw new Error(`Session not found: ${id}`);
    const next: SessionRecord = {
      ...current,
      phoneNumber: patch.phoneNumber !== undefined ? patch.phoneNumber : current.phoneNumber,
      pushName: patch.pushName !== undefined ? patch.pushName : current.pushName,
      lastConnectedAt:
        patch.lastConnectedAt !== undefined ? patch.lastConnectedAt : current.lastConnectedAt,
    };
    this.records[idx] = next;
    this.persist();
    return next;
  }

  remove(id: SessionId): void {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    if (this.records.length !== before) this.persist();
  }

  /** Clears auth-related metadata after a logout. */
  clearCredentials(id: SessionId): void {
    this.update(id, { lastConnectedAt: null });
  }

  // --- persistence (JSON snapshot) ------------------------------------------

  private load(): void {
    if (!existsSync(this.opts.filePath)) return;
    try {
      const raw = readFileSync(this.opts.filePath, 'utf8');
      const parsed = JSON.parse(raw) as { records?: SessionRecord[] };
      if (Array.isArray(parsed.records)) {
        this.records = parsed.records;
      }
    } catch {
      // Corrupt snapshot — start fresh rather than crashing the app.
      this.records = [];
    }
  }

  private persist(): void {
    const dir = dirname(this.opts.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.opts.filePath, JSON.stringify({ records: this.records }, null, 2), 'utf8');
  }
}
