/** Usage metering helpers with mock KV. */

import { describe, expect, test } from 'bun:test';
import type { ApiEnv } from '../src/env.js';
import {
  currentDay,
  currentPeriod,
  getMonthlyUsage,
  getUsageSnapshot,
  incrementUsage,
} from '../src/lib/usage.js';

function makeKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

describe('period keys', () => {
  test('currentPeriod returns YYYY-MM (UTC)', () => {
    const p = currentPeriod(new Date(Date.UTC(2026, 5, 15, 12, 0, 0)));
    expect(p).toBe('2026-06');
  });
  test('currentDay returns YYYY-MM-DD (UTC)', () => {
    const d = currentDay(new Date(Date.UTC(2026, 5, 15, 12, 0, 0)));
    expect(d).toBe('2026-06-15');
  });
});

describe('incrementUsage', () => {
  test('no-op when KV unbound', async () => {
    const env = {} as ApiEnv;
    expect(await incrementUsage(env, 't1', 'messages_sent')).toBe(0);
  });

  test('writes month + day counters', async () => {
    const kv = makeKv();
    const env = { AUTH_CACHE: kv } as ApiEnv;
    expect(await incrementUsage(env, 't1', 'messages_sent')).toBe(1);
    expect(await incrementUsage(env, 't1', 'messages_sent', 4)).toBe(5);
    expect(await getMonthlyUsage(env, 't1', 'messages_sent')).toBe(5);
  });

  test('counters are per-tenant', async () => {
    const kv = makeKv();
    const env = { AUTH_CACHE: kv } as ApiEnv;
    await incrementUsage(env, 't1', 'messages_sent');
    await incrementUsage(env, 't2', 'messages_sent');
    expect(await getMonthlyUsage(env, 't1', 'messages_sent')).toBe(1);
    expect(await getMonthlyUsage(env, 't2', 'messages_sent')).toBe(1);
  });
});

describe('getUsageSnapshot', () => {
  test('returns zeros when KV unbound', async () => {
    const snap = await getUsageSnapshot({} as ApiEnv, 't1');
    expect(snap.counters.messages_sent).toBe(0);
    expect(snap.counters.api_calls).toBe(0);
  });
  test('collects all five metrics', async () => {
    const kv = makeKv();
    const env = { AUTH_CACHE: kv } as ApiEnv;
    await incrementUsage(env, 't1', 'messages_sent', 3);
    await incrementUsage(env, 't1', 'api_calls', 7);
    const snap = await getUsageSnapshot(env, 't1');
    expect(snap.counters.messages_sent).toBe(3);
    expect(snap.counters.api_calls).toBe(7);
    expect(snap.counters.media_bytes).toBe(0);
  });
});
