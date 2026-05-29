/** Plan definitions module. */

import { describe, expect, test } from 'bun:test';
import { PLAN_NAMES, PLANS, getPlan, isPlanName } from '../src/lib/plans.js';

describe('PLANS', () => {
  test('all named plans defined', () => {
    for (const name of PLAN_NAMES) {
      expect(PLANS[name]).toBeDefined();
    }
  });

  test('tiers strictly ascending on sessions + messages + storage', () => {
    expect(PLANS.free.sessions).toBeLessThan(PLANS.pro.sessions);
    expect(PLANS.pro.sessions).toBeLessThan(PLANS.business.sessions);
    expect(PLANS.business.sessions).toBeLessThan(PLANS.enterprise.sessions);
    expect(PLANS.free.messagesPerMonth).toBeLessThan(PLANS.pro.messagesPerMonth);
    expect(PLANS.pro.storageMb).toBeLessThan(PLANS.business.storageMb);
  });

  test('frozen — runtime mutation throws in strict, no-op otherwise', () => {
    expect(Object.isFrozen(PLANS)).toBe(true);
  });
});

describe('getPlan', () => {
  test('returns matching plan', () => {
    expect(getPlan('pro').label).toBe('Pro');
  });
  test('falls back to free on unknown', () => {
    expect(getPlan('legendary').label).toBe('Free');
    expect(getPlan(null).label).toBe('Free');
    expect(getPlan(undefined).label).toBe('Free');
  });
});

describe('isPlanName', () => {
  test('recognises valid names', () => {
    expect(isPlanName('free')).toBe(true);
    expect(isPlanName('enterprise')).toBe(true);
  });
  test('rejects unknown', () => {
    expect(isPlanName('legendary')).toBe(false);
    expect(isPlanName(42)).toBe(false);
    expect(isPlanName(null)).toBe(false);
  });
});
