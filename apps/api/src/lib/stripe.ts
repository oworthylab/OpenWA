/**
 * Minimal Stripe REST client (US-050).
 *
 * We deliberately avoid the official `stripe` npm package: it bundles
 * Node-only crypto, swallows 200 KB into the Worker, and supports
 * dozens of resources we'll never touch. The two operations Sprint 6
 * actually needs are:
 *
 *   1. `verifyWebhookSignature` — validate the `Stripe-Signature`
 *      header on incoming `POST /v1/billing/webhooks` events.
 *   2. `createCheckoutSession` — kick off a hosted checkout from
 *      `POST /v1/billing/checkout`.
 *
 * Both are implemented in ~100 LOC against the documented HTTP API.
 * When `STRIPE_SECRET` / `STRIPE_WEBHOOK_SECRET` are unset (local
 * dev, e2e), `createCheckoutSession` returns a stub URL and
 * `verifyWebhookSignature` rejects every payload so test code must
 * provide the secret explicitly.
 */

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type StripeSignatureFailure =
  | 'malformed_header'
  | 'no_v1'
  | 'timestamp_outside_tolerance'
  | 'signature_mismatch';

export type StripeSignatureResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: StripeSignatureFailure };

/**
 * Parses and verifies a Stripe `Stripe-Signature` header against the
 * raw request body. Implements the algorithm documented at
 * https://stripe.com/docs/webhooks/signatures — we compute
 * HMAC-SHA256 over `${timestamp}.${payload}` and compare each `v1`
 * scheme entry in constant time.
 *
 * Pass the **raw** request body — JSON.stringify of a parsed payload
 * will not round-trip Stripe's whitespace.
 */
export async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  now: Date = new Date(),
): Promise<StripeSignatureResult> {
  if (!signatureHeader) return { valid: false, reason: 'malformed_header' };
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { valid: false, reason: 'malformed_header' };
  if (parsed.v1.length === 0) return { valid: false, reason: 'no_v1' };
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - parsed.timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp_outside_tolerance' };
  }
  const expected = await hmacHex(secret, `${parsed.timestamp}.${payload}`);
  for (const candidate of parsed.v1) {
    if (timingSafeEqualHex(candidate, expected)) {
      return { valid: true, timestamp: parsed.timestamp };
    }
  }
  return { valid: false, reason: 'signature_mismatch' };
}

interface ParsedSignature {
  timestamp: number;
  v1: string[];
}

function parseSignatureHeader(header: string): ParsedSignature | null {
  const parts = header.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 't') {
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) return null;
      timestamp = n;
    } else if (key === 'v1') {
      v1.push(value);
    }
  }
  if (timestamp === null) return null;
  return { timestamp, v1 };
}

/** Helper for tests + the checkout stub to construct a valid header. */
export async function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const sig = await hmacHex(secret, `${timestamp}.${payload}`);
  return `t=${timestamp},v1=${sig}`;
}

export interface CheckoutInput {
  /** Our internal tenant id — round-tripped via `client_reference_id`. */
  tenantId: string;
  /** Stripe price id (e.g. `price_pro_monthly`). */
  priceId: string;
  /** Reuse an existing customer when present. */
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  /** True when `STRIPE_SECRET` is unset and we returned a stub. */
  stub: boolean;
}

/**
 * Creates a Stripe Checkout Session via the REST API. When `secret`
 * is empty/undefined a deterministic stub is returned so dashboard +
 * e2e flows work without a live Stripe account.
 */
export async function createCheckoutSession(
  secret: string | undefined,
  input: CheckoutInput,
): Promise<CheckoutSession> {
  if (!secret) {
    const id = `cs_stub_${input.tenantId}_${Date.now()}`;
    return {
      id,
      url: `${input.successUrl}?session_id=${id}&stub=1`,
      stub: true,
    };
  }
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', input.successUrl);
  form.set('cancel_url', input.cancelUrl);
  form.set('line_items[0][price]', input.priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('client_reference_id', input.tenantId);
  if (input.customerId) form.set('customer', input.customerId);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2024-06-20',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`stripe checkout.sessions.create failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string; url: string };
  return { id: json.id, url: json.url, stub: false };
}

// -------------------- internals --------------------

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
