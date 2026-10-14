import { AppError } from '@impocaribe/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Tx } from '../audit/audit-log.ts';

type Versioned = PgTable & { id: AnyPgColumn; rowVersion: AnyPgColumn };

/**
 * DT-23 · RF-DM-12: aplica una edición solo si el registro sigue en la versión que el usuario vio, e incrementa
 * row_version. Si otro usuario guardó antes, responde STALE_RECORD con la versión actual (Const. art. II.6).
 */
export async function updateVersioned<T extends Versioned>(
  tx: Tx,
  table: T,
  id: string,
  expectedVersion: number,
  values: Partial<T['$inferInsert']>,
): Promise<T['$inferSelect']> {
  const [updated] = (await tx
    .update(table)
    .set({ ...values, rowVersion: sql`${table.rowVersion} + 1` } as never)
    .where(and(eq(table.id, id), eq(table.rowVersion, expectedVersion)))
    .returning()) as T['$inferSelect'][];
  if (updated) return updated;
  const [current] = (await tx
    .select({ rowVersion: table.rowVersion })
    .from(table as PgTable)
    .where(eq(table.id, id))) as { rowVersion: number }[];
  if (!current) throw new AppError('NOT_FOUND', 'El registro no existe.');
  throw new AppError(
    'STALE_RECORD',
    'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
    { currentVersion: current.rowVersion },
  );
}
