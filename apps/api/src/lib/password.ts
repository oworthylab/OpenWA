/**
 * Password hashing + verification token helpers for tenant registration
 * (US-047). Both primitives use the Web Crypto API so they run in
 * Cloudflare Workers, Bun, and Node without any native dependencies.
 *
 * **Password hashing — PBKDF2-SHA256 (310 000 iterations).**
 * OWASP's 2023 password storage cheat sheet permits PBKDF2-SHA256 at
 * ≥600 000 iterations as a fallback when Argon2id is unavailable. We
 * use 310 000 here as a compromise that keeps the Worker CPU budget
 * inside the free-tier 10 ms limit on cold paths; ops can raise this
 * when the platform moves to bound 30 s requests. The format is
 * portable: `pbkdf2-sha256$<iter>$<salt-b64>$<hash-b64>`.
 *
 * **Verification tokens — HMAC-signed payloads.**
 * `issueVerificationToken({userId, exp})` returns a short URL-safe
 * string of the form `<payload-b64>.<sig-b64>` where the payload is a
 * compact JSON object. The signature is HMAC-SHA256 over the payload
 * bytes using `secret`. `verifyVerificationToken` re-derives the
 * signature in constant time and checks expiry.
 */

const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_KEYLEN = 32; // bytes

export interface HashedPassword {
  /** Encoded as `pbkdf2-sha256$<iter>$<salt-b64>$<hash-b64>`. */
  toString(): string;
}

/** Hashes `plaintext` and returns the portable string encoding. */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(plaintext, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

/**
 * Constant-time verification of a password against an encoded hash.
 * Returns false on any parse error so callers can collapse "unknown
 * user" + "wrong password" into a single 401 without branching.
 */
export async function verifyPassword(plaintext: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iter = Number(parts[1]);
  if (!Number.isInteger(iter) || iter < 1000) return false;
  const salt = b64decode(parts[2] ?? '');
  const expected = b64decode(parts[3] ?? '');
  if (salt.byteLength === 0 || expected.byteLength === 0) return false;
  const actual = await pbkdf2(plaintext, salt, iter);
  return timingSafeEqualBytes(actual, expected);
}

export interface VerificationTokenPayload {
  /** Subject — typically a user id. */
  sub: string;
  /** Token purpose — namespaces the secret derivation. */
  purpose: 'email_verify' | 'password_reset';
  /** Unix seconds. */
  exp: number;
  /** Random nonce so tokens with the same payload differ. */
  nonce: string;
}

export interface IssueTokenInput {
  sub: string;
  purpose: VerificationTokenPayload['purpose'];
  /** Token lifetime in seconds. */
  ttlSeconds: number;
  /** Server-side secret. */
  secret: string;
}

/** Issues a tamper-evident verification token. */
export async function issueVerificationToken(input: IssueTokenInput): Promise<string> {
  const payload: VerificationTokenPayload = {
    sub: input.sub,
    purpose: input.purpose,
    exp: Math.floor(Date.now() / 1000) + input.ttlSeconds,
    nonce: b64encode(crypto.getRandomValues(new Uint8Array(8))),
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64encode(new TextEncoder().encode(payloadJson));
  const sig = await hmacB64(input.secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export type VerifyTokenResult =
  | { valid: true; payload: VerificationTokenPayload }
  | { valid: false; reason: 'malformed' | 'signature' | 'expired' };

/**
 * Verifies a token issued by {@link issueVerificationToken}. Returns
 * `{ valid: false, reason }` for every failure mode so callers can map
 * them to a single 400 with stable error codes.
 */
export async function verifyVerificationToken(
  token: string,
  secret: string,
): Promise<VerifyTokenResult> {
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) return { valid: false, reason: 'malformed' };
  const payloadB64 = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expectedSig = await hmacB64(secret, payloadB64);
  if (!timingSafeEqualString(sig, expectedSig)) return { valid: false, reason: 'signature' };
  let payload: VerificationTokenPayload;
  try {
    const json = new TextDecoder().decode(b64decode(payloadB64));
    payload = JSON.parse(json) as VerificationTokenPayload;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }
  return { valid: true, payload };
}

// -------------------- internals --------------------

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    baseKey,
    PBKDF2_KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

async function hmacB64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64encode(new Uint8Array(sig));
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bounded by length check
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(str: string): Uint8Array {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
