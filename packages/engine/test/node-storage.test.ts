import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFsStorage } from '../src/adapters/node/storage.js';

function freshDir() {
  return mkdtempSync(join(tmpdir(), 'openwa-engine-'));
}

describe('NodeFsStorage', () => {
  it('round-trips an object', async () => {
    const dir = freshDir();
    try {
      const storage = new NodeFsStorage(dir);
      await storage.set('creds', { id: 1, name: 'alice' });
      const got = await storage.get<{ id: number; name: string }>('creds');
      expect(got).toEqual({ id: 1, name: 'alice' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns null for missing keys', async () => {
    const dir = freshDir();
    try {
      const storage = new NodeFsStorage(dir);
      expect(await storage.get('nope')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles keys containing path-unsafe characters', async () => {
    const dir = freshDir();
    try {
      const storage = new NodeFsStorage(dir);
      const key = 'session-12345.abc=/weird+chars';
      await storage.set(key, { ok: true });
      expect(await storage.get(key)).toEqual({ ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('list filters by prefix', async () => {
    const dir = freshDir();
    try {
      const storage = new NodeFsStorage(dir);
      await storage.set('auth:a', 1);
      await storage.set('auth:b', 2);
      await storage.set('other:c', 3);
      const auth = await storage.list('auth:');
      expect(auth.sort()).toEqual(['auth:a', 'auth:b']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('delete removes a key; clear removes the whole dir', async () => {
    const dir = freshDir();
    try {
      const storage = new NodeFsStorage(dir);
      await storage.set('a', 1);
      await storage.set('b', 2);
      await storage.delete('a');
      expect(await storage.get('a')).toBeNull();
      expect(await storage.get('b')).toBe(2);
      await storage.clear();
      expect(await storage.list()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
