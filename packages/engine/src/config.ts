/**
 * Engine configuration. The same shape is consumed by both the Node and the
 * Cloudflare DO adapters; adapter-specific fields live under `adapter`.
 */

import type { AuthStrategy } from './auth/index.js';

export interface ReconnectionConfig {
  /** Base delay in ms before the first reconnection attempt. */
  baseDelayMs: number;
  /** Hard ceiling on the backoff window. */
  maxDelayMs: number;
  /** Max attempts before emitting `connection.error` and giving up. */
  maxAttempts: number;
  /** Jitter ratio applied to each delay (0..1). */
  jitter: number;
}

export const DEFAULT_RECONNECTION: ReconnectionConfig = {
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  maxAttempts: 10,
  jitter: 0.2,
};

export interface EngineConfig {
  /** Stable identifier used for logging and storage namespacing. */
  sessionId: string;
  /** Authentication strategy used the first time the engine connects. */
  auth: AuthStrategy;
  /** Optional reconnection tuning. Defaults to {@link DEFAULT_RECONNECTION}. */
  reconnection?: Partial<ReconnectionConfig>;
  /** Pino-style log level. Defaults to `'info'`. */
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /**
   * Push name advertised to the server. Optional. Some adapters auto-derive
   * this from the underlying account on first auth.
   */
  pushName?: string;
}

export function resolveReconnection(input: EngineConfig['reconnection']): ReconnectionConfig {
  return { ...DEFAULT_RECONNECTION, ...(input ?? {}) };
}

/**
 * Computes the next backoff delay with jitter. Pure — safe to unit-test.
 */
export function computeBackoffMs(attempt: number, cfg: ReconnectionConfig): number {
  const exponential = cfg.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, cfg.maxDelayMs);
  const jitterRange = capped * cfg.jitter;
  // Symmetrical jitter: ±jitterRange/2 around capped
  const offset = (Math.random() - 0.5) * jitterRange;
  return Math.max(0, Math.round(capped + offset));
}
