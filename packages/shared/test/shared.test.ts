import { describe, expect, test } from 'bun:test';
import {
  ERROR_CODES,
  MessageStatus,
  MessageType,
  SessionStatus,
  TenantPlan,
  UserRole,
  WebhookEvent,
} from '../src/index.js';

describe('@openwa/shared enums', () => {
  test('SessionStatus union is complete', () => {
    const all: SessionStatus[] = [
      'pending',
      'qr_required',
      'pairing',
      'connecting',
      'connected',
      'disconnected',
      'logged_out',
      'failed',
    ];
    for (const s of all) {
      expect(Object.values(SessionStatus)).toContain(s);
    }
  });

  test('MessageStatus has progression states', () => {
    expect(MessageStatus.Pending).toBe('pending');
    expect(MessageStatus.Sent).toBe('sent');
    expect(MessageStatus.Delivered).toBe('delivered');
    expect(MessageStatus.Read).toBe('read');
    expect(MessageStatus.Failed).toBe('failed');
  });

  test('MessageType supports all WhatsApp message kinds', () => {
    const required = ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact'];
    for (const t of required) {
      expect(Object.values(MessageType)).toContain(t);
    }
  });

  test('TenantPlan and UserRole are stable', () => {
    expect(TenantPlan.Free).toBe('free');
    expect(UserRole.Owner).toBe('owner');
  });

  test('WebhookEvent includes wildcard and granular events', () => {
    expect(WebhookEvent.All).toBe('*');
    expect(WebhookEvent.MessageReceived).toBe('message.received');
    expect(WebhookEvent.SessionStatus).toBe('session.status');
  });

  test('ERROR_CODES are stable strings', () => {
    expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    expect(ERROR_CODES.SESSION_NOT_FOUND).toBe('SESSION_NOT_FOUND');
  });
});
