import { AppError, type Clock } from '@impocaribe/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { auditLog } from '../db/schema/audit.ts';

/** Una entrada de la bitácora (RF-BIT-02): quién, desde qué dispositivo, qué acción, sobre qué entidad, antes y después. */
export interface AuditEntry {
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];
type Executor = Pick<NodePgDatabase, 'insert'> | Tx;

/** Registra una acción aceptada dentro de la transacción del cambio: si el cambio se revierte, el registro también. */
export function recordAudit(db: Executor, clock: Clock, entry: AuditEntry): Promise<unknown> {
  return insert(db, clock, entry, true);
}

function insert(db: Executor, clock: Clock, entry: AuditEntry, ok: boolean) {
  return db.insert(auditLog).values({
    at: clock.now(),
    userId: entry.userId ?? null,
    sessionId: entry.sessionId ?? null,
    deviceId: entry.deviceId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ok,
  });
}

export interface AuditedResult<T> {
  value: T;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Ejecuta una operación en una transacción y la deja en la bitácora. Si una regla de negocio la rechaza (AppError), la
 * transacción se revierte y el intento queda registrado aparte con ok = false, el código y el mensaje (plan §4.2).
 */
export async function auditedTransaction<T>(
  db: NodePgDatabase,
  clock: Clock,
  entry: AuditEntry,
  fn: (tx: Tx) => Promise<AuditedResult<T>>,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const result = await fn(tx);
      await recordAudit(tx, clock, {
        ...entry,
        entityId: result.entityId ?? entry.entityId,
        before: result.before ?? entry.before,
        after: result.after ?? entry.after,
      } as AuditEntry);
      return result.value;
    });
  } catch (err) {
    if (err instanceof AppError)
      await insert(db, clock, { ...entry, after: { code: err.code, message: err.message } }, false);
    throw err;
  }
}
