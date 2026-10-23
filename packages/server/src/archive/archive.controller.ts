// T101 · RF-CON-07, plan §6.2 (GET /archive/…): lo de más de 12 meses ya no está en la copia local de los dispositivos;
// P-12 lo busca aquí, con conexión. Mismos DTO que la sincronización.
import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { Clock } from '@impocaribe/shared';
import {
  ARCHIVE_LIMIT,
  ARCHIVE_MONTHS,
  archiveQuerySchema,
  declarationDtoSchema,
  orderDtoSchema,
} from '@impocaribe/shared/validation';
import { and, desc, eq, ilike, like, lt, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import { clients } from '../db/schema/catalogs.ts';
import { loadOrders, loadOrderVersions } from '../db/schema/orders.ts';
import { customsDeclarations, customsDeclarationVersions } from '../db/schema/vessels.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { readOrders } from '../orders/orders.repo.ts';
import { CLOCK, DB } from '../tokens.ts';
import { loadDeclarations } from '../vessels/vessels.repo.ts';

type Query = z.output<typeof archiveQuerySchema>;

/** El mismo corte que la copia local (sync/engine.ts): hoy menos 12 meses. */
function cutoff(now: Date): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - ARCHIVE_MONTHS);
  return d.toISOString().slice(0, 10);
}

const contains = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

@Controller('archive')
export class ArchiveController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Órdenes cargadas hace más de 12 meses, por su número completo o su parte final (RF-TAB-03). */
  @Get('orders')
  @Contract({ output: z.array(orderDtoSchema), roles: ALL_ROLES })
  orders(@Query(new ZodValidationPipe(archiveQuerySchema)) { q }: Query) {
    const ref = q.toUpperCase();
    const digits = /^\d{1,4}$/.test(ref) ? ref.padStart(4, '0') : null;
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select({ id: loadOrders.id })
          .from(loadOrders)
          .innerJoin(loadOrderVersions, eq(loadOrderVersions.id, loadOrders.currentVersionId))
          .where(
            and(
              lt(loadOrderVersions.loadingDate, cutoff(this.clock.now())),
              or(eq(loadOrders.number, ref), digits ? like(loadOrders.number, `%-${digits}`) : undefined),
            ),
          )
          .orderBy(desc(loadOrderVersions.loadingDate))
          .limit(ARCHIVE_LIMIT);
        if (rows.length === 0) return [];
        const found = await readOrders(tx, { ids: rows.map((r) => r.id) });
        return found.sort((a, b) => b.current.loadingDate.localeCompare(a.current.loadingDate));
      },
      { accessMode: 'read only' },
    );
  }

  /** DM cuyo plazo empezó hace más de 12 meses, por número, cliente o marca (RF-TAB-03). */
  @Get('declarations')
  @Contract({ output: z.array(declarationDtoSchema), roles: ALL_ROLES })
  declarations(@Query(new ZodValidationPipe(archiveQuerySchema)) { q }: Query) {
    const digits = /^\d{1,5}$/.test(q) ? q.padStart(5, '0') : null;
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select({ id: customsDeclarations.id })
          .from(customsDeclarations)
          .innerJoin(
            customsDeclarationVersions,
            eq(customsDeclarationVersions.id, customsDeclarations.currentVersionId),
          )
          .innerJoin(clients, eq(clients.id, customsDeclarations.clientId))
          .where(
            and(
              lt(customsDeclarations.deadlineStartDate, cutoff(this.clock.now())),
              or(
                digits ? eq(customsDeclarations.number, digits) : undefined,
                ilike(clients.name, contains(q)),
                ilike(customsDeclarationVersions.brand, contains(q)),
              ),
            ),
          )
          .orderBy(desc(customsDeclarations.deadlineStartDate))
          .limit(ARCHIVE_LIMIT);
        if (rows.length === 0) return [];
        const found = await loadDeclarations(tx, { ids: rows.map((r) => r.id) });
        return found.sort((a, b) => b.deadlineStartDate.localeCompare(a.deadlineStartDate));
      },
      { accessMode: 'read only' },
    );
  }
}
