/**
 * Tiny audit log writer. Best-effort: failures are swallowed so they never
 * block the user-facing response (audit is observational, not a barrier).
 */

import { auditLog } from '@openwa/db/control-plane';
import type { ControlPlaneDB } from '@openwa/db/helpers';
import { newId } from './crypto.js';

export interface AuditEntry {
  tenantId: string;
  apiKeyId?: string | undefined;
  userId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export async function writeAudit(db: ControlPlaneDB, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: newId(),
      tenantId: entry.tenantId,
      apiKeyId: entry.apiKeyId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch {
    // best-effort
  }
}
