/** Password hashing + verification token helpers. */

import { describe, expect, test } from 'bun:test';
import {
  hashPassword,
  issueVerificationToken,
  verifyPassword,
  verifyVerificationToken,
} from '../src/lib/password.js';

describe('hashPassword', () => {
  test('produces portable encoded form', async () => {
    const enc = await hashPassword('CorrectHorseBattery9!');
    const parts = enc.split('$');
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('pbkdf2-sha256');
    expect(Number(parts[1])).toBeGreaterThanOrEqual(100_000);
  });

  test('two hashes of the same password differ (random salt)', async () => {
    const a = await hashPassword('CorrectHorseBattery9!');
    const b = await hashPassword('CorrectHorseBattery9!');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  test('round-trip succeeds with correct password', async () => {
    const enc = await hashPassword('CorrectHorseBattery9!');
    expect(await verifyPassword('CorrectHorseBattery9!', enc)).toBe(true);
  });

  test('rejects wrong password', async () => {
    const enc = await hashPassword('CorrectHorseBattery9!');
    expect(await verifyPassword('Wrong', enc)).toBe(false);
  });

  test('rejects malformed encoded value', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2-sha256$1$$')).toBe(false);
    expect(await verifyPassword('x', 'argon2$1$abc$def')).toBe(false);
  });
});

describe('verification tokens', () => {
  const secret = 'test-secret';

  test('round-trip valid', async () => {
    const token = await issueVerificationToken({
      sub: 'user_123',
      purpose: 'email_verify',
      ttlSeconds: 60,
      secret,
    });
    const r = await verifyVerificationToken(token, secret);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.payload.sub).toBe('user_123');
      expect(r.payload.purpose).toBe('email_verify');
    }
  });

  test('detects bad signature', async () => {
    const token = await issueVerificationToken({
      sub: 'u',
      purpose: 'email_verify',
      ttlSeconds: 60,
      secret,
    });
    const tampered = `${token.split('.')[0]}.AAAAAAAAAA`;
    const r = await verifyVerificationToken(tampered, secret);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('signature');
  });

  test('rejects expired token', async () => {
    const token = await issueVerificationToken({
      sub: 'u',
      purpose: 'email_verify',
      ttlSeconds: -10,
      secret,
    });
    const r = await verifyVerificationToken(token, secret);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('expired');
  });

  test('rejects malformed token', async () => {
    const r = await verifyVerificationToken('no-dot-here', secret);
    expect(r.valid).toBe(false);
  });

  test('rejects wrong secret', async () => {
    const token = await issueVerificationToken({
      sub: 'u',
      purpose: 'email_verify',
      ttlSeconds: 60,
      secret,
    });
    const r = await verifyVerificationToken(token, 'other-secret');
    expect(r.valid).toBe(false);
  });
});
