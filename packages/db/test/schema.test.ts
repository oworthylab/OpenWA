import { describe, expect, test } from 'bun:test';
import { buildPaginated, paginate } from '../src/helpers.js';
import * as cp from '../src/schema/control-plane.js';
import * as tn from '../src/schema/tenant.js';

describe('control-plane schema', () => {
  test('exports expected tables', () => {
    expect(cp.users).toBeDefined();
    expect(cp.tenants).toBeDefined();
    expect(cp.tenantMembers).toBeDefined();
    expect(cp.sessions).toBeDefined();
    expect(cp.apiKeys).toBeDefined();
    expect(cp.webhooks).toBeDefined();
    expect(cp.auditLog).toBeDefined();
    expect(cp.usageCounters).toBeDefined();
  });
});

describe('tenant schema', () => {
  test('exports expected tables', () => {
    expect(tn.contacts).toBeDefined();
    expect(tn.groups).toBeDefined();
    expect(tn.groupMembers).toBeDefined();
    expect(tn.media).toBeDefined();
    expect(tn.messages).toBeDefined();
    expect(tn.labels).toBeDefined();
    expect(tn.labelAssignments).toBeDefined();
  });
});

describe('paginate helper', () => {
  test('clamps page and pageSize', () => {
    expect(paginate({ page: 0, pageSize: 0 })).toMatchObject({ page: 1, pageSize: 1, limit: 1, offset: 0 });
    expect(paginate({ page: 3, pageSize: 50 })).toMatchObject({ page: 3, pageSize: 50, limit: 50, offset: 100 });
    expect(paginate({ pageSize: 9999 }).pageSize).toBe(200);
  });

  test('buildPaginated computes hasMore', () => {
    const r = buildPaginated([1, 2, 3], 100, 1, 10);
    expect(r.pagination.hasMore).toBe(true);
    expect(r.pagination.total).toBe(100);

    const r2 = buildPaginated([1, 2, 3], 13, 2, 10);
    expect(r2.pagination.hasMore).toBe(false);
  });
});
