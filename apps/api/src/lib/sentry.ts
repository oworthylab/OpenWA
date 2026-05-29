/**
 * Sentry-compatible error reporter for the Worker (US-058).
 *
 * Why hand-rolled instead of `@sentry/cloudflare`?
 *   - Each `wrangler dev` reload reinitialises Workers; persistent
 *     transports leak. The official SDK is ~50 KB and ships a Node
 *     polyfill that bloats the bundle.
 *   - We need just two things: ship envelopes to the Sentry DSN, and
 *     no-op when the DSN isn't configured (so dev + tests stay silent).
 *
 * Behaviour:
 *   - `report(err, ctx)` builds a Sentry envelope and POSTs it via
 *     `fetch`. Failures are swallowed — error tracking must never
 *     cascade an outage.
 *   - When `dsn` is unset (or `dsn === 'stub'`), `report` is a no-op
 *     that still calls the optional `onCaptured` hook so tests can
 *     verify the call site without needing a live DSN.
 */

import type { LogFields } from './logger.js';

export interface SentryConfig {
  /** `https://<key>@<orgId>.ingest.sentry.io/<projectId>` or unset. */
  dsn?: string;
  /** Environment tag (`production`, `staging`, …). */
  environment?: string;
  /** Build sha or version string for source-map matching. */
  release?: string;
  /** Sample rate for non-error events. `1` keeps all, `0` drops all. */
  sampleRate?: number;
  /** Test hook invoked with the built event regardless of transport. */
  onCaptured?: (event: SentryEvent) => void;
  /** Override fetch (used in tests). */
  fetchImpl?: typeof fetch;
}

export interface SentryContext extends LogFields {
  /** Optional fingerprint override for grouping. */
  fingerprint?: string[];
  tags?: Record<string, string>;
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: 'javascript';
  level: 'error' | 'warning';
  environment?: string;
  release?: string;
  exception: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename: string; lineno?: number }> };
    }>;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
}

export class SentryReporter {
  private readonly cfg: SentryConfig;
  private readonly parsedDsn: ParsedDsn | null;

  constructor(config: SentryConfig = {}) {
    this.cfg = { sampleRate: 1, ...config };
    this.parsedDsn = parseDsn(this.cfg.dsn);
  }

  /** True when the DSN is set and transport will actually fire. */
  get enabled(): boolean {
    return this.parsedDsn !== null;
  }

  async report(error: unknown, context: SentryContext = {}): Promise<void> {
    const event = buildEvent(error, context, this.cfg);
    this.cfg.onCaptured?.(event);
    if (!this.parsedDsn) return;
    if (Math.random() > (this.cfg.sampleRate ?? 1)) return;
    try {
      const envelope = buildEnvelope(event, this.parsedDsn);
      await (this.cfg.fetchImpl ?? fetch)(this.parsedDsn.envelopeUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': sentryAuthHeader(this.parsedDsn),
        },
        body: envelope,
      });
    } catch {
      // best-effort
    }
  }
}

// -------------------- internals --------------------

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  envelopeUrl: string;
}

function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn || dsn === 'stub') return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return {
      publicKey: u.username,
      host: u.host,
      projectId,
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

function buildEvent(error: unknown, context: SentryContext, cfg: SentryConfig): SentryEvent {
  const err = normaliseError(error);
  const { fingerprint, tags, ...extra } = context;
  return {
    event_id: randomHex32(),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: cfg.environment,
    release: cfg.release,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack ? { frames: parseStack(err.stack) } : undefined,
        },
      ],
    },
    tags,
    extra,
    fingerprint,
  };
}

function normaliseError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'NonError', message: String(error) };
}

function parseStack(stack: string): Array<{ filename: string; lineno?: number }> {
  return stack
    .split('\n')
    .slice(1, 25)
    .map((line) => {
      const m = /\((.+?):(\d+):\d+\)$/.exec(line) ?? /at (.+?):(\d+):\d+$/.exec(line);
      if (!m) return { filename: line.trim() };
      const filename = m[1] ?? line.trim();
      const lineno = m[2] ? Number(m[2]) : undefined;
      return lineno !== undefined ? { filename, lineno } : { filename };
    });
}

function buildEnvelope(event: SentryEvent, dsn: ParsedDsn): string {
  const header = JSON.stringify({ event_id: event.event_id, dsn: dsn.envelopeUrl });
  const itemHeader = JSON.stringify({ type: 'event' });
  const body = JSON.stringify(event);
  return `${header}\n${itemHeader}\n${body}\n`;
}

function sentryAuthHeader(dsn: ParsedDsn): string {
  return [
    'Sentry sentry_version=7',
    'sentry_client=openwa-worker/1.0',
    `sentry_key=${dsn.publicKey}`,
  ].join(', ');
}

function randomHex32(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: fixed-size buffer
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}
