import { describe, expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { IpcEventChannel, IpcEventPayload } from '@openwa/shared/desktop';
import { SessionStatus } from '@openwa/shared/types';
import type { SessionId } from '@openwa/shared/types';
import type { NodeEngine } from '@openwa/engine/node';
import { EngineManager } from '../src/main/engine-manager.js';
import { SessionStore } from '../src/main/session-store.js';

/**
 * Bare-minimum fake that exercises the engine-manager event surface
 * without booting Baileys. We model only what {@link EngineManager}
 * actually calls.
 */
class FakeEngine extends EventEmitter {
  connectCalls = 0;
  disconnectCalls = 0;
  logoutCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }
  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }
  async logout(): Promise<void> {
    this.logoutCalls += 1;
  }
}

function makeManager() {
  const dir = mkdtempSync(join(tmpdir(), 'openwa-desktop-mgr-'));
  const store = new SessionStore({ filePath: join(dir, 'sessions.json') });
  const events: { channel: IpcEventChannel; payload: unknown }[] = [];
  const broadcast = mock(<C extends IpcEventChannel>(channel: C, payload: IpcEventPayload<C>) => {
    events.push({ channel, payload });
  });
  const engine = new FakeEngine();
  const manager = new EngineManager({
    store,
    authRoot: join(dir, 'auth'),
    broadcast,
    // The real NodeEngine constructor needs Baileys; substitute the fake.
    createEngine: () => engine as unknown as NodeEngine,
  });
  return { manager, store, broadcast, engine, events };
}

describe('EngineManager', () => {
  test('create + list returns disconnected summary', () => {
    const { manager } = makeManager();
    const created = manager.create({ name: 'work' });
    expect(created.status).toBe(SessionStatus.Disconnected);
    expect(manager.list()).toHaveLength(1);
  });

  test('start connects the engine and broadcasts status', async () => {
    const { manager, engine, events } = makeManager();
    const created = manager.create({ name: 'work' });
    await manager.start(created.id);
    expect(engine.connectCalls).toBe(1);
    const statusEvents = events.filter((e) => e.channel === 'session:status');
    expect(statusEvents.length).toBeGreaterThan(0);
  });

  test('stop disconnects and broadcasts disconnected status', async () => {
    const { manager, engine, events } = makeManager();
    const created = manager.create({ name: 'work' });
    await manager.start(created.id);
    await manager.stop(created.id);
    expect(engine.disconnectCalls).toBe(1);
    const last = events.at(-1);
    expect(last?.channel).toBe('session:status');
  });

  test('logout broadcasts logged_out + clears credentials', async () => {
    const { manager, store, engine, events } = makeManager();
    const created = manager.create({ name: 'work' });
    await manager.start(created.id);
    store.update(created.id, { lastConnectedAt: '2024-01-01T00:00:00.000Z' });
    await manager.logout(created.id);
    expect(engine.logoutCalls).toBe(1);
    expect(store.require(created.id).lastConnectedAt).toBeNull();
    const last = events.at(-1);
    expect(last?.channel).toBe('session:status');
    expect((last?.payload as { status: SessionStatus }).status).toBe(SessionStatus.LoggedOut);
  });

  test('remove broadcasts session:removed', async () => {
    const { manager, events } = makeManager();
    const created = manager.create({ name: 'work' });
    await manager.remove(created.id);
    const removed = events.find((e) => e.channel === 'session:removed');
    expect(removed?.payload).toEqual({ id: created.id });
  });

  test('forwards qr events to renderer', async () => {
    const { manager, engine, events } = makeManager();
    const created = manager.create({ name: 'work' });
    await manager.start(created.id);
    engine.emit('auth.qr', { type: 'auth.qr', qr: 'QRCODE', expiresAt: 12345 });
    const qrEvent = events.find((e) => e.channel === 'session:qr');
    expect(qrEvent?.payload).toMatchObject({ sessionId: created.id, qr: 'QRCODE', expiresAt: 12345 });
  });

  test('shutdown stops every active engine', async () => {
    const { manager, engine } = makeManager();
    const a = manager.create({ name: 'a' });
    const b = manager.create({ name: 'b' });
    await manager.start(a.id);
    await manager.start(b.id);
    await manager.shutdown();
    expect(engine.disconnectCalls).toBeGreaterThanOrEqual(1);
  });

  test('require unknown id throws', () => {
    const { manager } = makeManager();
    expect(() => manager.start('missing' as SessionId)).toThrow();
  });
});
