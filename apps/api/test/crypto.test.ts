import { describe, expect, test } from 'bun:test';
import {
  generateApiKey,
  generateWebhookSecret,
  hmacSha256Hex,
  newId,
  parseApiKeyPrefix,
  sha256Hex,
  timingSafeEqualHex,
} from '../src/lib/crypto.js';

describe('crypto/sha256', () => {
  test('produces stable hex digest', async () => {
    expect(await sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('crypto/hmac', () => {
  test('matches reference vector', async () => {
    // HMAC-SHA256("secret", "msg")
    const sig = await hmacSha256Hex('secret', 'msg');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // Same input → same output
    expect(await hmacSha256Hex('secret', 'msg')).toBe(sig);
    // Different secret → different output
    expect(await hmacSha256Hex('secret2', 'msg')).not.toBe(sig);
  });

  test('timingSafeEqualHex', () => {
    expect(timingSafeEqualHex('abc', 'abc')).toBe(true);
    expect(timingSafeEqualHex('abc', 'abd')).toBe(false);
    expect(timingSafeEqualHex('abc', 'abcd')).toBe(false);
  });
});

describe('api keys', () => {
  test('generated key roundtrips through parser', () => {
    const { plaintext, prefix } = generateApiKey();
    expect(plaintext).toMatch(/^openwa_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(parseApiKeyPrefix(plaintext)).toBe(prefix);
  });

  test('parser rejects garbage', () => {
    expect(parseApiKeyPrefix('not-a-key')).toBeNull();
    expect(parseApiKeyPrefix('openwa__shortsecret')).toBeNull();
  });

  test('two keys differ', () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });
});

describe('webhook secret', () => {
  test('format', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9]{32}$/);
  });
});

describe('newId', () => {
  test('uuid format', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('unique', () => {
    expect(newId()).not.toBe(newId());
  });
});
