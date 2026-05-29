import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionId } from '@openwa/shared/types';
import { SessionStore } from '../src/main/session-store.js';

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), 'openwa-desktop-'));
  return new SessionStore({ filePath: join(dir, 'sessions.json') });
}

describe('SessionStore', () => {
  test('create, list, get, require', () => {
    const store = makeStore();
    expect(store.list()).toEqual([]);

    const created = store.create({ name: 'work', phoneNumber: null });
    expect(created.name).toBe('work');
    expect(created.lastConnectedAt).toBeNull();
    expect(store.list()).toHaveLength(1);

    const fetched = store.get(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(store.require(created.id).id).toBe(created.id);
  });

  test('update merges patch fields', () => {
    const store = makeStore();
    const created = store.create({ name: 'work', phoneNumber: null });
    const updated = store.update(created.id, { pushName: 'Alice', lastConnectedAt: '2024-01-01T00:00:00.000Z' });
    expect(updated.pushName).toBe('Alice');
    expect(updated.lastConnectedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(updated.name).toBe('work');
  });

  test('remove drops the record', () => {
    const store = makeStore();
    const created = store.create({ name: 'work', phoneNumber: null });
    store.remove(created.id);
    expect(store.list()).toEqual([]);
  });

  test('require throws on unknown id', () => {
    const store = makeStore();
    expect(() => store.require('missing' as SessionId)).toThrow();
  });

  test('clearCredentials resets lastConnectedAt', () => {
    const store = makeStore();
    const created = store.create({ name: 'work', phoneNumber: null });
    store.update(created.id, { lastConnectedAt: '2024-01-01T00:00:00.000Z' });
    store.clearCredentials(created.id);
    expect(store.require(created.id).lastConnectedAt).toBeNull();
  });

  test('persists across instances', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openwa-desktop-'));
    const filePath = join(dir, 'sessions.json');
    const a = new SessionStore({ filePath });
    a.create({ name: 'work', phoneNumber: null });
    const b = new SessionStore({ filePath });
    expect(b.list()).toHaveLength(1);
    expect(b.list()[0]?.name).toBe('work');
  });
});
