/**
 * Validator wiring smoke tests for the new contact and group route
 * schemas (US-024, US-025). These don't hit a live engine — they just
 * confirm the validators accept good payloads and reject bad ones.
 */

import { describe, expect, test } from 'bun:test';
import {
  BlockContactSchema,
  CheckContactsSchema,
  ContactQuerySchema,
} from '@openwa/validators/contact';
import {
  CreateGroupSchema,
  GroupParticipantActionSchema,
  UpdateGroupSchema,
} from '@openwa/validators/group';
import * as v from 'valibot';

describe('contact validators', () => {
  test('CheckContactsSchema accepts a small batch', () => {
    const parsed = v.safeParse(CheckContactsSchema, { phones: ['+447700900000'] });
    expect(parsed.success).toBe(true);
  });

  test('CheckContactsSchema rejects empty arrays', () => {
    const parsed = v.safeParse(CheckContactsSchema, { phones: [] });
    expect(parsed.success).toBe(false);
  });

  test('CheckContactsSchema rejects batches > 50', () => {
    const phones = Array.from({ length: 51 }, (_, i) => `+44770090${String(i).padStart(4, '0')}`);
    const parsed = v.safeParse(CheckContactsSchema, { phones });
    expect(parsed.success).toBe(false);
  });

  test('BlockContactSchema accepts a JID', () => {
    const parsed = v.safeParse(BlockContactSchema, { jid: '447700900000@s.whatsapp.net' });
    expect(parsed.success).toBe(true);
  });

  test('BlockContactSchema rejects non-JIDs', () => {
    const parsed = v.safeParse(BlockContactSchema, { jid: 'not-a-jid' });
    expect(parsed.success).toBe(false);
  });

  test('ContactQuerySchema defaults are optional', () => {
    const parsed = v.safeParse(ContactQuerySchema, {});
    expect(parsed.success).toBe(true);
  });
});

describe('group validators', () => {
  test('CreateGroupSchema accepts a subject + participants', () => {
    const parsed = v.safeParse(CreateGroupSchema, {
      subject: 'Test group',
      participants: ['447700900000@s.whatsapp.net', '+447700900001'],
    });
    expect(parsed.success).toBe(true);
  });

  test('CreateGroupSchema rejects an empty participant list', () => {
    const parsed = v.safeParse(CreateGroupSchema, { subject: 'x', participants: [] });
    expect(parsed.success).toBe(false);
  });

  test('UpdateGroupSchema accepts partial updates', () => {
    expect(v.safeParse(UpdateGroupSchema, { subject: 'new subject' }).success).toBe(true);
    expect(v.safeParse(UpdateGroupSchema, { description: 'desc' }).success).toBe(true);
  });

  test('GroupParticipantActionSchema requires a valid action', () => {
    const good = v.safeParse(GroupParticipantActionSchema, {
      participants: ['447700900000@s.whatsapp.net'],
      action: 'promote',
    });
    expect(good.success).toBe(true);
    const bad = v.safeParse(GroupParticipantActionSchema, {
      participants: ['447700900000@s.whatsapp.net'],
      action: 'kick',
    });
    expect(bad.success).toBe(false);
  });
});
