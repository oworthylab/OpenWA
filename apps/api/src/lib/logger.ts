/**
 * Structured JSON logger for the API Worker (US-057).
 *
 * Why hand-rolled instead of pino/winston?
 *   - Workers' V8 isolate doesn't expose Node streams; both libraries
 *     ship Node-specific transports we'd have to gut.
 *   - `console.log(JSON.stringify(...))` is the canonical way to feed
 *     Cloudflare Logpush — anything more sophisticated is ceremony.
 *
 * Conventions:
 *   - One JSON object per `console.log` call.
 *   - Top-level fields: `ts`, `level`, `msg`, plus optional
 *     `requestId`, `tenantId`, `keyId`, and any free-form fields.
 *   - Sensitive values (`authorization` header, raw API keys, phone
 *     numbers) are redacted automatically by {@link redact}.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Resolved by the worker entry against `ENVIRONMENT` / `LOG_LEVEL`. */
export interface LoggerConfig {
  /** Minimum level emitted. Defaults to `'info'`. */
  minLevel?: LogLevel;
  /** Used to tag every record (e.g. `'production'`). */
  environment?: string;
  /** Optional fixed fields merged into every record. */
  base?: Record<string, unknown>;
  /** Custom sink for tests. Defaults to `console.log`. */
  sink?: (line: string) => void;
}

export interface LogFields extends Record<string, unknown> {
  requestId?: string;
  tenantId?: string;
  keyId?: string;
}

export class Logger {
  private readonly cfg: Required<Omit<LoggerConfig, 'base'>> & {
    base: Record<string, unknown>;
  };

  constructor(config: LoggerConfig = {}) {
    this.cfg = {
      minLevel: config.minLevel ?? 'info',
      environment: config.environment ?? 'development',
      base: { ...(config.base ?? {}) },
      sink: config.sink ?? ((line: string) => console.log(line)),
    };
  }

  /** Returns a new logger with additional fixed fields merged in. */
  child(fields: LogFields): Logger {
    return new Logger({
      minLevel: this.cfg.minLevel,
      environment: this.cfg.environment,
      base: { ...this.cfg.base, ...fields },
      sink: this.cfg.sink,
    });
  }

  debug(msg: string, fields: LogFields = {}): void {
    this.emit('debug', msg, fields);
  }
  info(msg: string, fields: LogFields = {}): void {
    this.emit('info', msg, fields);
  }
  warn(msg: string, fields: LogFields = {}): void {
    this.emit('warn', msg, fields);
  }
  error(msg: string, fields: LogFields = {}): void {
    this.emit('error', msg, fields);
  }

  private emit(level: LogLevel, msg: string, fields: LogFields): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.cfg.minLevel]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      env: this.cfg.environment,
      msg,
      ...this.cfg.base,
      ...redact(fields),
    };
    try {
      this.cfg.sink(JSON.stringify(record));
    } catch {
      // Logging must never throw — fall back to plain console.error.
      console.error('[logger] failed to serialise record', { level, msg });
    }
  }
}

/**
 * Returns a shallow copy of `fields` with known-sensitive keys masked.
 * Recurses one level into nested objects (Headers etc).
 */
export function redact<T extends Record<string, unknown>>(fields: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = redactValue(k, v);
  }
  return out as T;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'x-api-key',
  'apikey',
  'apiKey',
  'api_key',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'token',
  'webhookSecret',
]);

function redactValue(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEYS.has(lower) || SENSITIVE_KEYS.has(key)) {
    return '[REDACTED]';
  }
  if (lower === 'phone' || lower === 'phonenumber' || lower === 'phone_number') {
    return maskPhone(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return redact(value as Record<string, unknown>);
  }
  return value;
}

/** Returns the phone with all but the trailing 4 digits replaced with `*`. */
export function maskPhone(input: unknown): string | unknown {
  if (typeof input !== 'string') return input;
  if (input.length <= 4) return '****';
  return `${'*'.repeat(input.length - 4)}${input.slice(-4)}`;
}

/** Default logger used when callers don't construct their own. */
export const defaultLogger = new Logger();
