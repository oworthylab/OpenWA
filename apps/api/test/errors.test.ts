import { describe, expect, test } from 'bun:test';
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  internal,
  notFound,
  unauthorized,
  validationFailed,
} from '../src/errors.js';

describe('ApiError.toResponse', () => {
  test('serialises code/message/details', async () => {
    const err = new ApiError({
      status: 418,
      code: 'TEAPOT',
      message: 'short and stout',
      details: { reason: 'brewing' },
    });
    const res = err.toResponse();
    expect(res.status).toBe(418);
    const body = (await res.json()) as { error: { code: string; message: string; details: unknown } };
    expect(body.error.code).toBe('TEAPOT');
    expect(body.error.message).toBe('short and stout');
    expect(body.error.details).toEqual({ reason: 'brewing' });
  });

  test('omits details when undefined', async () => {
    const err = new ApiError({ status: 400, code: 'BAD', message: 'no' });
    const body = (await err.toResponse().json()) as { error: Record<string, unknown> };
    expect(body.error.details).toBeUndefined();
  });
});

describe('error helpers', () => {
  test('status codes', () => {
    expect(notFound().status).toBe(404);
    expect(badRequest('x').status).toBe(400);
    expect(validationFailed([]).status).toBe(400);
    expect(conflict('x').status).toBe(409);
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(internal().status).toBe(500);
  });

  test('default codes', () => {
    expect(notFound().code).toBe('NOT_FOUND');
    expect(badRequest('x').code).toBe('BAD_REQUEST');
    expect(validationFailed([]).code).toBe('VALIDATION_ERROR');
    expect(unauthorized().code).toBe('UNAUTHORIZED');
    expect(forbidden().code).toBe('INSUFFICIENT_ROLE');
    expect(internal().code).toBe('INTERNAL_ERROR');
  });
});
