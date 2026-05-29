/** Sentry reporter tests (Sprint 8, US-058). */

import { describe, expect, test } from 'bun:test';
import { SentryReporter } from '../src/lib/sentry.js';

describe('SentryReporter — disabled', () => {
  test('reports `enabled = false` when DSN absent', () => {
    const s = new SentryReporter({});
    expect(s.enabled).toBe(false);
  });

  test("reports `enabled = false` when DSN is 'stub'", () => {
    const s = new SentryReporter({ dsn: 'stub' });
    expect(s.enabled).toBe(false);
  });

  test('still invokes onCaptured for visibility in tests', async () => {
    let captured: { message: string } | null = null;
    const s = new SentryReporter({
      onCaptured: (e) => {
        captured = { message: e.exception.values[0]!.value };
      },
    });
    await s.report(new Error('boom'));
    expect(captured).not.toBeNull();
    expect(captured!.message).toBe('boom');
  });
});

describe('SentryReporter — enabled', () => {
  test('parses DSN and posts an envelope', async () => {
    let calledUrl = '';
    let calledAuth = '';
    let calledBody = '';
    const s = new SentryReporter({
      dsn: 'https://abc@o1234.ingest.sentry.io/5678',
      environment: 'production',
      release: 'r1',
      fetchImpl: (async (url: string | URL, init?: RequestInit) => {
        calledUrl = String(url);
        calledAuth = String(
          (init?.headers as Record<string, string> | undefined)?.['x-sentry-auth'] ?? '',
        );
        calledBody = String(init?.body ?? '');
        return new Response('ok');
      }) as unknown as typeof fetch,
    });
    expect(s.enabled).toBe(true);
    await s.report(new Error('kapow'), { tenantId: 't1' });
    expect(calledUrl).toBe('https://o1234.ingest.sentry.io/api/5678/envelope/');
    expect(calledAuth).toContain('sentry_key=abc');
    const lines = calledBody.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    const event = JSON.parse(lines[2]!);
    expect(event.exception.values[0].value).toBe('kapow');
    expect(event.environment).toBe('production');
    expect(event.release).toBe('r1');
    expect(event.extra.tenantId).toBe('t1');
  });

  test('swallows fetch failures', async () => {
    const s = new SentryReporter({
      dsn: 'https://abc@o1.ingest.sentry.io/2',
      fetchImpl: (() => Promise.reject(new Error('network'))) as unknown as typeof fetch,
    });
    await expect(s.report(new Error('x'))).resolves.toBeUndefined();
  });
});
