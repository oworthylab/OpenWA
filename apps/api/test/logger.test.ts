/** Logger redaction + level filtering tests (Sprint 8, US-057). */

import { describe, expect, test } from 'bun:test';
import { Logger, maskPhone, redact } from '../src/lib/logger.js';

describe('Logger', () => {
  test('filters records below the minimum level', () => {
    const lines: string[] = [];
    const log = new Logger({ minLevel: 'warn', sink: (l) => lines.push(l) });
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).msg).toBe('c');
    expect(JSON.parse(lines[1]!).msg).toBe('d');
  });

  test('emits a JSON line with ts, level, env, msg and base fields', () => {
    const lines: string[] = [];
    const log = new Logger({
      minLevel: 'debug',
      environment: 'test',
      base: { service: 'api' },
      sink: (l) => lines.push(l),
    });
    log.info('hello', { tenantId: 't1' });
    const rec = JSON.parse(lines[0]!);
    expect(rec.level).toBe('info');
    expect(rec.env).toBe('test');
    expect(rec.service).toBe('api');
    expect(rec.tenantId).toBe('t1');
    expect(typeof rec.ts).toBe('string');
  });

  test('child() merges base fields without mutating the parent', () => {
    const lines: string[] = [];
    const parent = new Logger({ minLevel: 'debug', sink: (l) => lines.push(l) });
    const child = parent.child({ requestId: 'r1' });
    child.info('hi');
    parent.info('hi');
    expect(JSON.parse(lines[0]!).requestId).toBe('r1');
    expect(JSON.parse(lines[1]!).requestId).toBeUndefined();
  });

  test('emit swallows sink failures', () => {
    const log = new Logger({
      minLevel: 'debug',
      sink: () => {
        throw new Error('boom');
      },
    });
    expect(() => log.info('x')).not.toThrow();
  });
});

describe('redact', () => {
  test('masks known sensitive keys', () => {
    const r = redact({ authorization: 'Bearer x', cookie: 'c', token: 'tok', other: 'ok' });
    expect(r.authorization).toBe('[REDACTED]');
    expect(r.cookie).toBe('[REDACTED]');
    expect(r.token).toBe('[REDACTED]');
    expect(r.other).toBe('ok');
  });

  test('recurses one level into objects', () => {
    const r = redact({ headers: { 'x-api-key': 'abc', accept: 'application/json' } });
    const headers = r.headers as Record<string, unknown>;
    expect(headers['x-api-key']).toBe('[REDACTED]');
    expect(headers.accept).toBe('application/json');
  });

  test('masks phone fields with maskPhone', () => {
    const r = redact({ phone: '+12025551234' });
    expect(r.phone).toBe('********1234');
  });
});

describe('maskPhone', () => {
  test('keeps the last 4 digits', () => {
    expect(maskPhone('+12025551234')).toBe('********1234');
  });
  test('handles short input', () => {
    expect(maskPhone('12')).toBe('****');
  });
  test('passes through non-strings', () => {
    expect(maskPhone(undefined)).toBeUndefined();
    expect(maskPhone(null)).toBeNull();
  });
});
