/**
 * Standard error envelope returned by every non-2xx API response.
 * Mirrors `ApiErrorResponse` from `@openwa/shared/errors`.
 */

import { ERROR_CODES, type ErrorCode } from '@openwa/shared/errors';

export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;

  constructor(opts: {
    status: number;
    code: ErrorCode | string;
    message: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    if (opts.details !== undefined) this.details = opts.details;
  }

  toResponse(): Response {
    const body: ApiErrorBody = {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
    return Response.json(body, { status: this.status });
  }
}

export function notFound(
  message = 'Not found',
  code: ErrorCode | string = ERROR_CODES.NOT_FOUND,
): ApiError {
  return new ApiError({ status: 404, code, message });
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError({ status: 400, code: ERROR_CODES.BAD_REQUEST, message, details });
}

export function validationFailed(details: unknown): ApiError {
  return new ApiError({
    status: 400,
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Validation failed',
    details,
  });
}

export function conflict(
  message: string,
  code: ErrorCode | string = ERROR_CODES.CONFLICT,
): ApiError {
  return new ApiError({ status: 409, code, message });
}

export function unauthorized(
  message = 'Authentication required',
  code: ErrorCode | string = ERROR_CODES.UNAUTHORIZED,
): ApiError {
  return new ApiError({ status: 401, code, message });
}

export function forbidden(
  message = 'Forbidden',
  code: ErrorCode | string = ERROR_CODES.INSUFFICIENT_ROLE,
): ApiError {
  return new ApiError({ status: 403, code, message });
}

export function internal(message = 'Internal server error', details?: unknown): ApiError {
  return new ApiError({ status: 500, code: ERROR_CODES.INTERNAL_ERROR, message, details });
}
