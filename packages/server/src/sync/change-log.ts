import type { Clock } from '@impocaribe/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../audit/audit-log.ts';
import { changeLog, syncState } from '../db/schema/sync.ts';

/** Un cambio replicable, con el DTO ya calculado (plan §4.4). */
export interface Change {
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  /** `all`, `editors`, `apoderada` o `user:{id}` */
  audience: string;
  payload: unknown;
  refDate?: string;
}

/**
 * DT-04 · plan §5.9: registra los cambios de la transacción y devuelve el último número (`syncSeq` de la respuesta).
 * Debe ser el **último paso antes del COMMIT**: el bloqueo de la fila de sync_state se mantiene hasta el COMMIT, así que
 * los números quedan confirmados en orden y ningún cliente ve un hueco que luego se llene.
 */
export async function recordChanges(tx: Tx, clock: Clock, changes: Change[]): Promise<number> {
  if (changes.length === 0) {
    const [state] = await tx.select({ lastSeq: syncState.lastSeq }).from(syncState);
    return state!.lastSeq;
  }
  const [state] = await tx
    .update(syncState)
    .set({ lastSeq: sql`${syncState.lastSeq} + ${changes.length}` })
    .returning({ lastSeq: syncState.lastSeq });
  const first = state!.lastSeq - changes.length + 1;
  const committedAt = clock.now();
  await tx.insert(changeLog).values(
    changes.map((c, i) => ({
      seq: first + i,
      entityType: c.entityType,
      entityId: c.entityId,
      op: c.op,
      audience: c.audience,
      payload: c.payload,
      refDate: c.refDate ?? null,
      committedAt,
    })),
  );
  return state!.lastSeq;
}
