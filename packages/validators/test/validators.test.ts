import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import {
  ApiKeyCreateSchema,
  CreateSessionSchema,
  LoginSchema,
  RegisterSchema,
  SendMediaSchema,
  SendTextSchema,
  WebhookConfigSchema,
  formatIssues,
} from '../src/index.js';

describe('auth schemas', () => {
  test('RegisterSchema accepts valid input', () => {
    const r = v.safeParse(RegisterSchema, {
      email: 'alice' + '@' + 'example.com',
      password: 'SuperSecret123!',
      name: 'Alice',
      tenantName: 'Acme',
      tenantSlug: 'acme',
    });
    expect(r.success).toBe(true);
  });

  test('RegisterSchema rejects weak password', () => {
    const r = v.safeParse(RegisterSchema, {
      email: 'alice' + '@' + 'example.com',
      password: 'short',
      name: 'A',
      tenantName: 'A',
      tenantSlug: 'a',
    });
    expect(r.success).toBe(false);
  });

  test('LoginSchema lowercases email', () => {
    const r = v.safeParse(LoginSchema, { email: 'alice' + '@' + 'example.com', password: 'x' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.output.email).toBe('alice' + '@' + 'example.com');
  });

  test('ApiKeyCreateSchema requires valid role', () => {
    const ok = v.safeParse(ApiKeyCreateSchema, { name: 'k', role: 'read_only' });
    expect(ok.success).toBe(true);
    const bad = v.safeParse(ApiKeyCreateSchema, { name: 'k', role: 'god' });
    expect(bad.success).toBe(false);
  });
});

describe('session schemas', () => {
  test('CreateSessionSchema accepts valid name', () => {
    const r = v.safeParse(CreateSessionSchema, { name: 'sales-bot' });
    expect(r.success).toBe(true);
  });

  test('CreateSessionSchema rejects empty name', () => {
    const r = v.safeParse(CreateSessionSchema, { name: '' });
    expect(r.success).toBe(false);
  });

  test('CreateSessionSchema requires HTTPS proxy URL', () => {
    const bad = v.safeParse(CreateSessionSchema, { name: 'x', proxyUrl: 'http://insecure.example' });
    expect(bad.success).toBe(false);
  });
});

describe('message schemas', () => {
  test('SendTextSchema accepts JID', () => {
    const r = v.safeParse(SendTextSchema, { to: '6281234567890' + '@' + 's.whatsapp.net', body: 'hi' });
    expect(r.success).toBe(true);
  });

  test('SendTextSchema accepts phone E.164', () => {
    const r = v.safeParse(SendTextSchema, { to: '+6281234567890', body: 'hi' });
    expect(r.success).toBe(true);
  });

  test('SendTextSchema rejects empty body', () => {
    const r = v.safeParse(SendTextSchema, { to: '+6281234567890', body: '' });
    expect(r.success).toBe(false);
  });

  test('SendMediaSchema requires exactly one of url or base64', () => {
    const both = v.safeParse(SendMediaSchema, {
      to: '+6281234567890',
      type: 'image',
      url: 'https://example.com/a.png',
      base64: 'AAAA',
    });
    expect(both.success).toBe(false);

    const neither = v.safeParse(SendMediaSchema, { to: '+6281234567890', type: 'image' });
    expect(neither.success).toBe(false);

    const ok = v.safeParse(SendMediaSchema, {
      to: '+6281234567890',
      type: 'image',
      url: 'https://example.com/a.png',
    });
    expect(ok.success).toBe(true);
  });
});

describe('webhook schema', () => {
  test('WebhookConfigSchema requires HTTPS URL', () => {
    const ok = v.safeParse(WebhookConfigSchema, {
      url: 'https://hooks.example.com/x',
      events: ['message.received'],
    });
    expect(ok.success).toBe(true);

    const bad = v.safeParse(WebhookConfigSchema, {
      url: 'http://insecure.example.com',
      events: ['message.received'],
    });
    expect(bad.success).toBe(false);
  });

  test('WebhookConfigSchema rejects empty events', () => {
    const r = v.safeParse(WebhookConfigSchema, {
      url: 'https://hooks.example.com/x',
      events: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('formatIssues', () => {
  test('produces structured error payload', () => {
    const r = v.safeParse(SendTextSchema, { to: 'not-valid', body: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const formatted = formatIssues(r.issues);
      expect(formatted.code).toBe('VALIDATION_ERROR');
      expect(formatted.issues.length).toBeGreaterThan(0);
      expect(formatted.issues[0]).toHaveProperty('path');
    }
  });
});
