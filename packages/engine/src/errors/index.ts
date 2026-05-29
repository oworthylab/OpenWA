/**
 * Engine error taxonomy. Errors emitted by adapters MUST inherit from `EngineError`
 * so consumers can branch on `error.code` rather than fragile message strings.
 */

export const ENGINE_ERROR_CODES = {
  CONFIG_INVALID: 'ENGINE_CONFIG_INVALID',
  ADAPTER_NOT_FOUND: 'ENGINE_ADAPTER_NOT_FOUND',
  STATE_INVALID_TRANSITION: 'ENGINE_STATE_INVALID_TRANSITION',
  CONNECTION_FAILED: 'ENGINE_CONNECTION_FAILED',
  CONNECTION_CLOSED: 'ENGINE_CONNECTION_CLOSED',
  CONNECTION_TIMEOUT: 'ENGINE_CONNECTION_TIMEOUT',
  AUTH_FAILED: 'ENGINE_AUTH_FAILED',
  AUTH_TIMEOUT: 'ENGINE_AUTH_TIMEOUT',
  AUTH_LOGGED_OUT: 'ENGINE_AUTH_LOGGED_OUT',
  AUTH_NOT_READY: 'ENGINE_AUTH_NOT_READY',
  SEND_FAILED: 'ENGINE_SEND_FAILED',
  MEDIA_UPLOAD_FAILED: 'ENGINE_MEDIA_UPLOAD_FAILED',
  MEDIA_DOWNLOAD_FAILED: 'ENGINE_MEDIA_DOWNLOAD_FAILED',
  STORAGE_FAILED: 'ENGINE_STORAGE_FAILED',
  RATE_LIMITED: 'ENGINE_RATE_LIMITED',
  NOT_IMPLEMENTED: 'ENGINE_NOT_IMPLEMENTED',
} as const;

export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[keyof typeof ENGINE_ERROR_CODES];

export interface EngineErrorOptions {
  code: EngineErrorCode;
  message: string;
  cause?: unknown;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(options: EngineErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'EngineError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

export function isEngineError(value: unknown): value is EngineError {
  return value instanceof EngineError;
}
