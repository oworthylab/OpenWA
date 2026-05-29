import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as controlPlaneSchema from './schema/control-plane.js';
import * as tenantSchema from './schema/tenant.js';

export type ControlPlaneDB = DrizzleD1Database<typeof controlPlaneSchema>;
export type TenantDB = DrizzleD1Database<typeof tenantSchema>;

export function getControlPlaneDB(binding: D1Database): ControlPlaneDB {
  return drizzleD1(binding, { schema: controlPlaneSchema });
}

export function getTenantDB(binding: D1Database): TenantDB {
  return drizzleD1(binding, { schema: tenantSchema });
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

export function paginate(params: PaginationParams = {}): {
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
}

export function buildPaginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    data,
    pagination: { page, pageSize, total, hasMore: page * pageSize < total },
  };
}
