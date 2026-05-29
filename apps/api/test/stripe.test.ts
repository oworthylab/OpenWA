/** Stripe webhook signature verification. */

import { describe, expect, test } from 'bun:test';
import { signWebhookPayload, verifyWebhookSignature } from '../src/lib/stripe.js';

const SECRET = 'whsec_test_secret_value';

describe('verifyWebhookSignature', () => {
  test('valid signature passes', async () => {
    const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(payload, SECRET, ts);
    const r = await verifyWebhookSignature(payload, header, SECRET);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.timestamp).toBe(ts);
  });

  test('rejects missing header', async () => {
    const r = await verifyWebhookSignature('{}', null, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('malformed_header');
  });

  test('rejects malformed header', async () => {
    const r = await verifyWebhookSignature('{}', 'not-a-header', SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('malformed_header');
  });

  test('rejects header without v1 scheme', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const r = await verifyWebhookSignature('{}', `t=${ts},v0=abc`, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('no_v1');
  });

  test('rejects stale timestamp (> 5 min)', async () => {
    const payload = '{}';
    const stale = Math.floor(Date.now() / 1000) - 600;
    const header = await signWebhookPayload(payload, SECRET, stale);
    const r = await verifyWebhookSignature(payload, header, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('timestamp_outside_tolerance');
  });

  test('rejects mismatched signature', async () => {
    const payload = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(payload, SECRET, ts);
    // Tamper with the body — signature won't match
    const r = await verifyWebhookSignature('{"id":"evt_2"}', header, SECRET);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('signature_mismatch');
  });

  test('rejects wrong secret', async () => {
    const payload = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload(payload, SECRET, ts);
    const r = await verifyWebhookSignature(payload, header, 'whsec_other');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('signature_mismatch');
  });
});
