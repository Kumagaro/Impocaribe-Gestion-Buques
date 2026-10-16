// Escritura de negocio completa (Const. art. II.5 y IV.1): idempotente por (dispositivo, clave) (DT-22), con su registro
// en la bitácora dentro de la misma transacción, y el rechazo de una regla de negocio registrado aparte con ok = false.
import { AppError, type Clock } from '@impocaribe/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request } from 'express';
import { recordAudit, recordRejected, type AuditEntry, type Tx } from '../audit/audit-log.ts';
import { idempotencyRequest, withIdempotency, type WriteResult } from './idempotency.ts';

export interface AuditedWrite extends WriteResult {
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export async function auditedWrite(
  db: NodePgDatabase,
  clock: Clock,
  req: Request,
  entry: AuditEntry,
  fn: (tx: Tx) => Promise<AuditedWrite>,
): Promise<WriteResult> {
  try {
    return await withIdempotency(db, clock, idempotencyRequest(req), async (tx) => {
      const { entityId, before, after, ...result } = await fn(tx);
      await recordAudit(tx, clock, {
        ...entry,
        ...(entityId !== undefined ? { entityId } : {}),
        ...(before !== undefined ? { before } : {}),
        ...(after !== undefined ? { after } : {}),
      });
      return result;
    });
  } catch (err) {
    if (err instanceof AppError && err.code !== 'IDEMPOTENCY_MISMATCH') await recordRejected(db, clock, entry, err);
    throw err;
  }
}
