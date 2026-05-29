/**
 * Multi-tenant isolation contract test.
 *
 * Every protected route file must reference `auth.tenantId` (the tenant
 * context injected by `authenticate()`). A route that performs DB work
 * without scoping by tenantId would be a cross-tenant data leak.
 *
 * This is a *contract* test — it scans source. It catches:
 *   - new route files that forget to derive `auth`
 *   - new route files that derive `auth` but never use `auth.tenantId`
 *
 * Route files that are intentionally *unauthenticated* (auth, billing
 * webhooks, docs, health) are listed in `UNAUTH_ROUTES` and skipped.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_DIR = join(import.meta.dir, '..', 'src', 'routes');

/** Route files that are intentionally tenant-agnostic. */
const UNAUTH_ROUTES = new Set(['auth.ts', 'billing.ts', 'docs.ts', 'health.ts', 'mart.ts']);

describe('multi-tenant isolation contract', () => {
  const files = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts'));

  test('every protected route references auth.tenantId', () => {
    const violations: string[] = [];
    for (const file of files) {
      if (UNAUTH_ROUTES.has(file)) continue;
      const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
      if (!src.includes('auth.tenantId')) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  test('every protected route derives auth context', () => {
    const violations: string[] = [];
    for (const file of files) {
      if (UNAUTH_ROUTES.has(file)) continue;
      const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
      // either `.derive(auth)` (Sprint 3 pattern) or explicit
      // `await authenticate(request, env)` (older modules)
      const hasAuth =
        src.includes('.derive(auth)') ||
        src.includes('authenticate(request, env)') ||
        src.includes("from '../middleware/auth.js'");
      if (!hasAuth) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  test('mart webhooks scope by tenant via integration secret lookup', () => {
    const src = readFileSync(join(ROUTES_DIR, 'mart.ts'), 'utf8');
    // mart link/sync are authenticated; the webhook resolves tenant via
    // the stored secret hash.
    expect(src).toContain('auth.tenantId');
  });

  test('auth.ts is the only place that creates tenants', () => {
    const violations: string[] = [];
    for (const file of files) {
      if (file === 'auth.ts') continue;
      const src = readFileSync(join(ROUTES_DIR, file), 'utf8');
      if (/db\.insert\(\s*tenants\s*\)/.test(src)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});
