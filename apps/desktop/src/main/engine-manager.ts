/**
 * Engine manager — owns the pool of local Baileys engines that back each
 * desktop session. One {@link NodeEngine} per WhatsApp session.
 *
 * Responsibilities:
 *  - Track persisted sessions and lazily instantiate their
 *    {@link NodeEngine} when started.
 *  - Translate engine events ({@link EngineEvent}) into
 *    {@link DesktopSessionSummary} updates broadcast to the renderer.
 *  - Coordinate graceful shutdown on `before-quit` (US-044 task: resource
 *    cleanup).
 *
 * The class is UI-agnostic — it accepts a `broadcast` callback rather
 * than reaching into Electron's `webContents` so it can be unit-tested
 * without a running renderer.
 *
 * **Sprint 5 status:** scaffold only. Not yet wired into the live
 * Electron main process — the dev container can't run native modules.
 * The skeleton compiles, exercises the real engine event surface, and
 * is unit-test friendly; Sprint 6 will run it end-to-end on a host OS.
 */

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { ENGINE_ERROR_CODES, EngineError } from '@openwa/engine';
import { NodeEngine } from '@openwa/engine/node';
import { CONNECTION_STATES, type ConnectionState } from '@openwa/engine/state';
import type {
  CreateDesktopSessionInput,
  DesktopQrPayload,
  DesktopSessionSummary,
  IpcEventChannel,
  IpcEventPayload,
} from '@openwa/shared/desktop';
import { SessionStatus } from '@openwa/shared/types';
import type { PhoneE164, SessionId } from '@openwa/shared/types';
import type { SessionRecord, SessionStore } from './session-store.js';

/** Subset of {@link IpcEventMap} that the engine manager emits. */
export type EngineBroadcast = <C extends IpcEventChannel>(
  channel: C,
  payload: IpcEventPayload<C>,
) => void;

export interface EngineManagerOptions {
  /** Persistent session store. */
  store: SessionStore;
  /** Directory under which each session's Baileys auth state lives. */
  authRoot: string;
  /** Renderer broadcast hook. */
  broadcast: EngineBroadcast;
  /** Factory hook so tests can substitute a fake engine. */
  createEngine?: (record: SessionRecord) => NodeEngine;
}

interface ActiveEngine {
  record: SessionRecord;
  engine: NodeEngine;
  /** Last status pushed to the renderer — used for snapshot reads. */
  lastSummary: DesktopSessionSummary;
}

const STATE_TO_STATUS: Record<ConnectionState, SessionStatus> = {
  [CONNECTION_STATES.Idle]: SessionStatus.Pending,
  [CONNECTION_STATES.Connecting]: SessionStatus.Connecting,
  [CONNECTION_STATES.Authenticating]: SessionStatus.Pairing,
  [CONNECTION_STATES.Open]: SessionStatus.Connected,
  [CONNECTION_STATES.Closing]: SessionStatus.Disconnected,
  [CONNECTION_STATES.Closed]: SessionStatus.Disconnected,
  [CONNECTION_STATES.Reconnecting]: SessionStatus.Connecting,
};

export class EngineManager extends EventEmitter {
  private readonly engines = new Map<SessionId, ActiveEngine>();
  private shuttingDown = false;

  constructor(private readonly opts: EngineManagerOptions) {
    super();
  }

  // -------------------- public API --------------------

  /** Returns persisted session list, with live status overlaid when running. */
  list(): DesktopSessionSummary[] {
    return this.opts.store.list().map((r) => this.summaryFor(r));
  }

  create(input: CreateDesktopSessionInput): DesktopSessionSummary {
    const record = this.opts.store.create({
      name: input.name,
      phoneNumber: input.phoneNumber ?? null,
    });
    return this.summaryFor(record);
  }

  async start(id: SessionId): Promise<DesktopSessionSummary> {
    const record = this.opts.store.require(id);
    const existing = this.engines.get(id);
    if (existing) return existing.lastSummary;

    const engine = (this.opts.createEngine ?? this.defaultCreateEngine.bind(this))(record);
    const active: ActiveEngine = {
      record,
      engine,
      lastSummary: this.summaryFor(record),
    };
    this.engines.set(id, active);
    this.attachEngineEvents(active);

    try {
      await engine.connect();
    } catch (err) {
      this.handleEngineError(active, err);
      throw err;
    }
    return this.pushStatusSummary(active);
  }

  async stop(id: SessionId): Promise<DesktopSessionSummary> {
    const active = this.engines.get(id);
    if (!active) {
      return this.summaryFor(this.opts.store.require(id));
    }
    await active.engine.disconnect().catch(() => undefined);
    this.engines.delete(id);
    active.lastSummary = { ...active.lastSummary, status: SessionStatus.Disconnected };
    this.opts.broadcast('session:status', active.lastSummary);
    return active.lastSummary;
  }

  async restart(id: SessionId): Promise<DesktopSessionSummary> {
    await this.stop(id);
    return this.start(id);
  }

  async logout(id: SessionId): Promise<DesktopSessionSummary> {
    const active = this.engines.get(id);
    if (active) {
      await active.engine.logout().catch(() => undefined);
      this.engines.delete(id);
    }
    this.opts.store.clearCredentials(id);
    const record = this.opts.store.require(id);
    const summary: DesktopSessionSummary = {
      ...this.summaryFor(record),
      status: SessionStatus.LoggedOut,
    };
    this.opts.broadcast('session:status', summary);
    return summary;
  }

  async remove(id: SessionId): Promise<void> {
    await this.stop(id).catch(() => undefined);
    this.opts.store.remove(id);
    this.opts.broadcast('session:removed', { id });
  }

  /**
   * Triggers a QR refresh. Cold-starts the engine if it isn't running;
   * otherwise relies on Baileys' built-in 20s rotation.
   */
  async requestQr(id: SessionId): Promise<{ requested: boolean }> {
    if (!this.engines.has(id)) {
      await this.start(id);
    }
    return { requested: true };
  }

  /** Graceful shutdown — wired from Electron's `before-quit` handler. */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    const ids = Array.from(this.engines.keys());
    await Promise.allSettled(ids.map((id) => this.stop(id)));
  }

  // -------------------- internals --------------------

  private defaultCreateEngine(record: SessionRecord): NodeEngine {
    const auth = record.phoneNumber
      ? ({ type: 'pairing-code', phoneNumber: record.phoneNumber } as const)
      : ({ type: 'qr' } as const);
    return new NodeEngine({
      config: { sessionId: record.id, auth, logLevel: 'info' },
      authDir: join(this.opts.authRoot, record.id),
    });
  }

  private attachEngineEvents(active: ActiveEngine): void {
    const { engine, record } = active;

    engine.on('connection.state', (event) => {
      const summary: DesktopSessionSummary = {
        ...this.summaryFor(record),
        status: STATE_TO_STATUS[event.state] ?? SessionStatus.Pending,
      };
      active.lastSummary = summary;
      this.opts.broadcast('session:status', summary);
    });

    engine.on('connection.error', (event) => this.handleEngineError(active, event.error));

    engine.on('auth.qr', (event) => {
      const payload: DesktopQrPayload = {
        sessionId: record.id,
        qr: event.qr,
        expiresAt: event.expiresAt,
      };
      this.opts.broadcast('session:qr', payload);
      active.lastSummary = { ...active.lastSummary, status: SessionStatus.QrRequired };
      this.opts.broadcast('session:status', active.lastSummary);
    });

    engine.on('auth.pairing_code', () => {
      active.lastSummary = { ...active.lastSummary, status: SessionStatus.Pairing };
      this.opts.broadcast('session:status', active.lastSummary);
    });

    engine.on('auth.ready', (event) => {
      const phone = parsePhoneFromJid(event.jid);
      this.opts.store.update(record.id, {
        phoneNumber: phone ?? record.phoneNumber,
        pushName: event.pushName ?? record.pushName,
        lastConnectedAt: new Date().toISOString(),
      });
      active.record = this.opts.store.require(record.id);
      this.pushStatusSummary(active);
    });

    engine.on('auth.logged_out', () => {
      active.lastSummary = { ...active.lastSummary, status: SessionStatus.LoggedOut };
      this.opts.broadcast('session:status', active.lastSummary);
    });
  }

  private handleEngineError(active: ActiveEngine, err: unknown): void {
    const engineErr =
      err instanceof EngineError
        ? err
        : new EngineError({
            code: ENGINE_ERROR_CODES.CONNECTION_FAILED,
            message: err instanceof Error ? err.message : String(err),
          });
    active.lastSummary = {
      ...active.lastSummary,
      lastError: { code: engineErr.code, message: engineErr.message },
    };
    this.opts.broadcast('engine:error', {
      sessionId: active.record.id,
      code: engineErr.code,
      message: engineErr.message,
    });
    this.opts.broadcast('session:status', active.lastSummary);
  }

  private pushStatusSummary(active: ActiveEngine): DesktopSessionSummary {
    active.lastSummary = this.summaryFor(active.record);
    this.opts.broadcast('session:status', active.lastSummary);
    return active.lastSummary;
  }

  private summaryFor(record: SessionRecord): DesktopSessionSummary {
    const active = this.engines.get(record.id);
    return {
      id: record.id,
      name: record.name,
      status: active?.lastSummary.status ?? SessionStatus.Disconnected,
      phoneNumber: record.phoneNumber,
      pushName: record.pushName,
      lastConnectedAt: record.lastConnectedAt,
      lastError: active?.lastSummary.lastError ?? null,
    };
  }
}

/** Best-effort JID → E.164 extraction (`<digits>@s.whatsapp.net` → `+<digits>`). */
function parsePhoneFromJid(jid: string): PhoneE164 | null {
  const digits = jid.split('@')[0];
  if (!digits || !/^\d+$/.test(digits)) return null;
  return `+${digits}` as PhoneE164;
}
