/**
 * Minimal Mart REST client (US-053, US-056).
 *
 * Real Mart wiring is deferred to Sprint 8 — for now the only call we
 * actually make is `verifyOwnership`, and we operate in **stub mode**
 * (returning a deterministic placeholder) when the store URL isn't
 * reachable or the environment is `'test'`. This lets the dashboard
 * registration + sync UI light up without a sandbox Mart account.
 *
 * The shape mirrors what we expect Mart to expose at
 * `POST /api/integrations/verify` once the contract is published.
 */

import { sha256Hex, timingSafeEqualHex } from './crypto.js';

export interface MartVerifyResult {
  /** True when the secret matched a known store. */
  ok: boolean;
  /** Returned by Mart so we can show "Linked to Acme Coffee". */
  storeName?: string;
  storeMetadata?: Record<string, unknown>;
  /** True when we returned a stub instead of calling Mart. */
  stub: boolean;
}

export interface MartVerifyOpts {
  storeUrl: string;
  secret: string;
  /** When true, return a stub even if the URL is reachable. */
  forceStub?: boolean;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Confirms a tenant owns the store at `storeUrl` by POSTing the
 * shared secret. Falls back to a stub when the URL is missing or
 * `forceStub` is set so dev flows don't require Mart.
 */
export async function verifyOwnership(opts: MartVerifyOpts): Promise<MartVerifyResult> {
  if (opts.forceStub || !opts.storeUrl.startsWith('https://')) {
    return { ok: true, storeName: 'Stub Store', stub: true };
  }
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${opts.storeUrl}/api/integrations/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: opts.secret }),
    });
    if (!res.ok) return { ok: false, stub: false };
    const body = (await res.json()) as {
      ok?: boolean;
      storeName?: string;
      metadata?: Record<string, unknown>;
    };
    return {
      ok: Boolean(body.ok),
      storeName: body.storeName,
      storeMetadata: body.metadata,
      stub: false,
    };
  } catch {
    return { ok: false, stub: false };
  }
}

/**
 * Generic HMAC-SHA256 verify against a stored secret hash. Mart
 * webhooks reuse this for the inbound `X-Mart-Secret` header — Mart
 * sends the raw secret, we sha256 it and constant-time compare to
 * the stored `mart_integrations.secret_hash`.
 */
export async function verifyStoredSecret(plaintext: string, storedHash: string): Promise<boolean> {
  const incoming = await sha256Hex(plaintext);
  return timingSafeEqualHex(incoming, storedHash);
}
