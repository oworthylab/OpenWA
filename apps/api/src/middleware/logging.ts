/**
 * Request-level structured logger middleware (US-057 + US-058).
 *
 * Per request we:
 *   1. Ensure an `X-Request-ID` (generate if missing) and propagate it
 *      out on the response — Workers + DOs use the same value so traces
 *      can be stitched across boundaries.
 *   2. Stamp `requestId` (and `tenantId` once auth resolves) onto the
 *      logger context so every log line carries the correlation id.
 *   3. Emit a single `request.complete` line on the way out with
 *      `method`, `path`, `status`, `duration_ms`.
 *
 * We deliberately do not log request bodies — PII + secret leakage.
 */

import type { ApiEnv } from '../env.js';
import { newId } from '../lib/crypto.js';
import { type LogLevel, Logger } from '../lib/logger.js';

const ENV_LEVEL: Record<string, LogLevel> = {
  development: 'debug',
  test: 'error',
  staging: 'info',
  production: 'info',
};

let cachedLogger: Logger | null = null;
let cachedKey = '';

export function getLogger(env: ApiEnv): Logger {
  const envKey = env.ENVIRONMENT ?? 'development';
  const key = `${envKey}:${env.LOG_LEVEL ?? ''}`;
  if (cachedLogger && cachedKey === key) return cachedLogger;
  const level = (env.LOG_LEVEL as LogLevel | undefined) ?? ENV_LEVEL[envKey] ?? 'info';
  cachedLogger = new Logger({
    minLevel: level,
    environment: envKey,
    base: { service: 'openwa-api' },
  });
  cachedKey = key;
  return cachedLogger;
}

/** Reset the logger cache (tests). */
export function resetLoggerCache(): void {
  cachedLogger = null;
  cachedKey = '';
}

export interface RequestLogContext {
  requestId: string;
  startedAt: number;
}

export function beginRequest(request: Request): RequestLogContext {
  const requestId = request.headers.get('x-request-id') ?? request.headers.get('cf-ray') ?? newId();
  return { requestId, startedAt: Date.now() };
}

export function completeRequest(
  env: ApiEnv,
  ctx: RequestLogContext,
  request: Request,
  status: number,
  extra: Record<string, unknown> = {},
): void {
  const duration_ms = Date.now() - ctx.startedAt;
  const url = new URL(request.url);
  const logger = getLogger(env);
  const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  logger[level]('request.complete', {
    requestId: ctx.requestId,
    method: request.method,
    path: url.pathname,
    status,
    duration_ms,
    ...extra,
  });
}
