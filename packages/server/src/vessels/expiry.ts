// T067 · RF-PLZ-03, D7, DT-08, plan §5.7: al empezar el día 31 la DM vence; cada asignación se reduce a lo cargado y
// lo demás vuelve libre a su buque. La tarea corre al arrancar y cada 10 minutos; ninguna regla depende de que ya haya
// pasado (el estado se calcula con la hora del servidor).
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { addDays, compareTons, DEADLINE_DAYS, havanaDate, parseTons, type Clock } from '@impocaribe/shared';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { recordAudit, type Tx } from '../audit/audit-log.ts';
import { allocationChanges, allocations, customsDeclarations, vAllocationBalance } from '../db/schema/vessels.ts';
import { CLOCK, DB } from '../tokens.ts';
import {
  addVersion,
  currentVersion,
  loadDeclaration,
  lockDeclaration,
  lockVessels,
  replicate,
  vesselsOfDeclaration,
} from './vessels.repo.ts';

const EVERY_MS = 10 * 60_000;
const EXPIRE_REASON = 'Vencimiento automático: empezó el día 31 del plazo.';

/** Reduce cada asignación de la DM (ya bloqueada) a lo cargado, con su registro `expire_release`. */
export async function releaseToLoaded(tx: Tx, clock: Clock, declarationId: string, reason: string, userId?: string) {
  const rows = await tx
    .select({
      id: allocations.id,
      allocatedTons: allocations.allocatedTons,
      loadedTons: vAllocationBalance.loadedTons,
      rowVersion: allocations.rowVersion,
    })
    .from(allocations)
    .innerJoin(vAllocationBalance, eq(vAllocationBalance.allocationId, allocations.id))
    .where(eq(allocations.declarationId, declarationId));
  for (const a of rows) {
    if (compareTons(parseTons(a.allocatedTons), parseTons(a.loadedTons)) <= 0) continue;
    await tx
      .update(allocations)
      .set({ allocatedTons: a.loadedTons, rowVersion: a.rowVersion + 1, updatedAt: clock.now() })
      .where(eq(allocations.id, a.id));
    await tx.insert(allocationChanges).values({
      allocationId: a.id,
      previousTons: a.allocatedTons,
      newTons: a.loadedTons,
      kind: 'expire_release',
      reason,
      createdBy: userId ?? null,
      createdAt: clock.now(),
    });
  }
}

/** Vence las DM que llegaron al día 31 y aún no se marcaron. Devuelve cuántas venció. */
export async function expireDue(db: NodePgDatabase, clock: Clock): Promise<number> {
  // día ≥ 31 ⇔ hoy ≥ inicio + 30
  const limit = addDays(havanaDate(clock.now()), -DEADLINE_DAYS);
  const due = await db
    .select({ id: customsDeclarations.id })
    .from(customsDeclarations)
    .where(and(isNull(customsDeclarations.expiredAt), lte(customsDeclarations.deadlineStartDate, limit)))
    .orderBy(asc(customsDeclarations.id));
  let count = 0;
  for (const { id } of due) {
    const expired = await db.transaction(async (tx) => {
      // DT-09: los buques antes que la DM.
      const vesselIds = await vesselsOfDeclaration(tx, id);
      await lockVessels(tx, vesselIds);
      const row = await lockDeclaration(tx, id);
      if (row.expiredAt || row.deadlineStartDate > limit) return false;
      const before = await loadDeclaration(tx, id);
      // RF-DM-06: una DM con todo cargado está Cerrada, no Vencida.
      if (before.totalTons && compareTons(parseTons(before.loadedTons), parseTons(before.totalTons)) === 0)
        return false;
      await releaseToLoaded(tx, clock, id, EXPIRE_REASON);
      const version = await currentVersion(tx, row.currentVersionId!);
      await addVersion(
        tx,
        clock,
        id,
        { brand: version.brand, totalTons: version.totalTons, kind: 'expire', reason: EXPIRE_REASON, createdBy: null },
        { expiredAt: clock.now() },
      );
      const after = await loadDeclaration(tx, id);
      await recordAudit(tx, clock, {
        action: 'declaration.expire',
        entityType: 'declaration',
        entityId: id,
        before,
        after,
        reason: EXPIRE_REASON,
      });
      // shortcut: la alerta AL-04 llega con el motor de alertas (F7).
      await replicate(tx, clock, { declarations: [id], vessels: vesselIds });
      return true;
    });
    if (expired) count++;
  }
  return count;
}

@Injectable()
export class DeclarationExpiry implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    const run = () =>
      void expireDue(this.db, this.clock).catch((err: unknown) =>
        new Logger('DeclarationExpiry').error(`No se pudieron vencer las DM: ${String(err)}`),
      );
    run();
    this.timer = setInterval(run, EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }
}
