/**
 * Crypto + ID helpers using the Web Crypto API (works in CF Workers,
 * Bun, and modern Node).
 */

/**
 * SHA-256 hex digest of a UTF-8 string.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(buf));
}

/**
 * HMAC-SHA256 hex digest of a UTF-8 message with a UTF-8 secret.
 * Used for webhook signatures (`X-OpenWA-Signature: sha256=<hex>`).
 */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Constant-time signature comparison (returns false on length mismatch).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * RFC 4122 v4 UUID using `crypto.randomUUID()` when available, else a
 * fallback using `crypto.getRandomValues`.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // RFC 4122 v4 bits
  // biome-ignore lint/style/noNonNullAssertion: indexed access on fixed-size array
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // biome-ignore lint/style/noNonNullAssertion: indexed access on fixed-size array
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generates a fresh API key in the `openwa_<prefix>_<secret>` format.
 *
 * - `prefix`: 8 random alphanumeric chars (indexed in D1 for fast lookup).
 * - `secret`: 32 random alphanumeric chars (~190 bits of entropy).
 *
 * Callers store `sha256Hex(plaintext)` in the DB; the plaintext is shown
 * to the user exactly once at creation time.
 */
export function generateApiKey(): { plaintext: string; prefix: string } {
  const prefix = randomAlphanumeric(8);
  const secret = randomAlphanumeric(32);
  return { plaintext: `openwa_${prefix}_${secret}`, prefix };
}

/**
 * Extracts the `prefix` segment from a `openwa_<prefix>_<secret>` key, or
 * returns `null` if the format is invalid.
 */
export function parseApiKeyPrefix(plaintext: string): string | null {
  const m = /^openwa_([A-Za-z0-9]{8})_[A-Za-z0-9]{32}$/.exec(plaintext);
  return m?.[1] ?? null;
}

/** Webhook secret in `whsec_<32 alphanumerics>` format. */
export function generateWebhookSecret(): string {
  return `whsec_${randomAlphanumeric(32)}`;
}

// -------------------- internals --------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomAlphanumeric(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: indexed access on fixed-size array
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: indexed access on fixed-size array
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}
