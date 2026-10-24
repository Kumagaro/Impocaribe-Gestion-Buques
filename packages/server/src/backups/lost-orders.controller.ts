// T109 · RF-RES-06, 07, plan §5.10 (6): las órdenes perdidas en una restauración. Recuperar una es una transacción como
// la emisión, pero conserva su id, su número, su secuencia, sus fechas, sus versiones y su PDF original, y valida el
// saldo; si falla, se guarda el motivo y la orden sigue en la lista. Descartarla pide motivo. Solo Apoderadas.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { AppError, compareTons, formatTons, parseTons, type Clock } from '@impocaribe/shared';
import { lostOrderDtoSchema, reasonSchema, type LostOrderDto, type OrderSnapshot } from '@impocaribe/shared/validation';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { files, officialSignatures, officialStamps } from '../db/schema/company.ts';
import { loadOrders, loadOrderVersions, loadOrderVersionTrailers } from '../db/schema/orders.ts';
import { lostOrders } from '../db/schema/restores.ts';
import { users } from '../db/schema/users.ts';
import { allocations, customsDeclarations, vAllocationBalance, vessels } from '../db/schema/vessels.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { replicateOrders } from '../orders/orders.repo.ts';
import { CLOCK, DATA_DIR, DB } from '../tokens.ts';
import { lockDeclaration, lockVessels, replicate } from '../vessels/vessels.repo.ts';

const A = ['apoderada'] as const;
const discardSchema = z.object({ reason: reasonSchema });

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];
/** Lo que guardó la restauración (las fechas, en JSON, vuelven como texto). */
interface Payload {
  order: Row<typeof loadOrders>;
  versions: Row<typeof loadOrderVersions>[];
  trailers: Row<typeof loadOrderVersionTrailers>[];
  signatures: Row<typeof officialSignatures>[];
  stamps: Row<typeof officialStamps>[];
  files: Row<typeof files>[];
}
const dates = <T extends object>(row: T, keys: (keyof T)[]): T =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, keys.includes(k as keyof T) && v ? new Date(v as string) : v]),
  ) as T;

const resolvers = alias(users, 'resolvers');
const issuers = alias(users, 'issuers');

function dtoOf(r: Row<typeof lostOrders>, resolvedByName: string | null, issuedByName: string | null): LostOrderDto {
  const p = r.payload as Payload;
  const current = p.versions.find((v) => v.id === p.order.currentVersionId) ?? p.versions.at(-1)!;
  const s = current.snapshot as OrderSnapshot;
  return {
    id: r.id,
    restoreId: r.restoreId,
    number: r.number,
    declarationNumber: s.declarationNumber,
    clientName: s.clientName,
    truckPlate: s.truckPlate,
    tons: current.tons,
    loadingDate: current.loadingDate,
    issuedAt: new Date(current.issuedAt).toISOString(),
    issuedByName,
    orderStatus: p.order.status,
    status: r.status,
    lastError: r.lastError,
    discardReason: r.discardReason,
    resolvedByName,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  };
}

@Controller('lost-orders')
export class LostOrdersController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATA_DIR) private readonly dataDir: string,
  ) {}

  @Get()
  @Contract({ output: z.array(lostOrderDtoSchema), roles: A })
  async list(): Promise<LostOrderDto[]> {
    const rows = await this.db
      .select({ l: lostOrders, resolvedBy: resolvers.fullName })
      .from(lostOrders)
      .leftJoin(resolvers, eq(resolvers.id, lostOrders.resolvedBy))
      .orderBy(desc(lostOrders.createdAt), lostOrders.number);
    const names = new Map(
      (await this.db.select({ id: issuers.id, name: issuers.fullName }).from(issuers)).map((u) => [u.id, u.name]),
    );
    return rows.map(({ l, resolvedBy }) => {
      const p = l.payload as Payload;
      const current = p.versions.find((v) => v.id === p.order.currentVersionId) ?? p.versions.at(-1)!;
      return dtoOf(l, resolvedBy, current.issuedBy ? (names.get(current.issuedBy) ?? null) : null);
    });
  }

  /** RF-RES-07: la registra de nuevo con su número original; si el saldo ya no alcanza, guarda el motivo. */
  @Post(':id/recover')
  @HttpCode(200)
  @Contract({ output: lostOrderDtoSchema, errors: ['OVERDRAFT_ALLOCATION'], roles: A })
  async recover(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, id, 'order.recover', async (tx, lost) => {
      const p = lost.payload as Payload;
      const o = p.order;
      const [vessel] = await lockVessels(tx, [o.vesselId]).catch(() => [undefined]);
      if (!vessel)
        throw new AppError('VALIDATION_ERROR', 'El buque de esta orden ya no existe: descártela con motivo.');
      const [dm] = await tx
        .select({ id: customsDeclarations.id })
        .from(customsDeclarations)
        .where(eq(customsDeclarations.id, o.declarationId));
      if (!dm) throw new AppError('VALIDATION_ERROR', 'La DM de esta orden ya no existe: descártela con motivo.');
      await lockDeclaration(tx, o.declarationId);
      const [alloc] = await tx.select().from(allocations).where(eq(allocations.id, o.allocationId)).for('update');
      if (!alloc)
        throw new AppError('VALIDATION_ERROR', 'La asignación de esta orden ya no existe: descártela con motivo.');
      const [already] = await tx.select({ id: loadOrders.id }).from(loadOrders).where(eq(loadOrders.id, o.id));
      if (already) throw new AppError('VALIDATION_ERROR', `La orden ${o.number} ya está registrada.`);
      const current = p.versions.find((v) => v.id === o.currentVersionId)!;
      if (o.status === 'official') {
        const [b] = await tx.select().from(vAllocationBalance).where(eq(vAllocationBalance.allocationId, alloc.id));
        const balance = parseTons(b!.balanceTons);
        const tons = parseTons(current.tons);
        if (compareTons(tons, balance) > 0)
          throw new AppError(
            'OVERDRAFT_ALLOCATION',
            `No alcanza el saldo: la orden ${o.number} lleva ${formatTons(tons)} y quedan ${formatTons(balance)} en la asignación.`,
          );
      }
      for (const f of p.files)
        if (!existsSync(join(this.dataDir, f.storagePath)))
          throw new AppError(
            'VALIDATION_ERROR',
            `Falta en el servidor un archivo de la orden ${o.number} (su PDF, la firma o el cuño).`,
          );
      if (p.files.length)
        await tx
          .insert(files)
          .values(p.files.map((f) => dates(f, ['createdAt'])))
          .onConflictDoNothing();
      if (p.signatures.length)
        await tx
          .insert(officialSignatures)
          .values(p.signatures.map((x) => dates(x, ['createdAt'])))
          .onConflictDoNothing();
      if (p.stamps.length)
        await tx
          .insert(officialStamps)
          .values(p.stamps.map((x) => dates(x, ['createdAt'])))
          .onConflictDoNothing();
      await tx.insert(loadOrders).values(dates(o, ['createdAt']));
      await tx.insert(loadOrderVersions).values(p.versions.map((v) => dates(v, ['issuedAt'])));
      if (p.trailers.length) await tx.insert(loadOrderVersionTrailers).values(p.trailers);
      await replicateOrders(tx, this.clock, { orders: [o.id], vessels: [o.vesselId], declarations: [o.declarationId] });
      await replicate(tx, this.clock, { vessels: [o.vesselId], declarations: [o.declarationId] });
      await tx
        .update(lostOrders)
        .set({ status: 'recovered', lastError: null, resolvedBy: req.auth.userId, resolvedAt: this.clock.now() })
        .where(eq(lostOrders.id, id));
      return { entityType: 'order', entityId: o.id, after: { number: o.number, tons: current.tons } };
    });
  }

  @Post(':id/discard')
  @HttpCode(200)
  @Contract({ input: discardSchema, output: lostOrderDtoSchema, roles: A })
  async discard(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(discardSchema)) input: z.output<typeof discardSchema>,
  ) {
    await this.write(req, res, id, 'order.lost.discard', async (tx, lost) => {
      await tx
        .update(lostOrders)
        .set({
          status: 'discarded',
          discardReason: input.reason,
          resolvedBy: req.auth.userId,
          resolvedAt: this.clock.now(),
        })
        .where(eq(lostOrders.id, id));
      return { entityType: 'lost_order', entityId: id, after: { number: lost.number }, reason: input.reason };
    });
  }

  private async write(
    req: AuthedRequest,
    res: Response,
    id: string,
    action: string,
    fn: (
      tx: Tx,
      lost: Row<typeof lostOrders>,
    ) => Promise<{ entityType: string; entityId: string; after: unknown; reason?: string }>,
  ) {
    const { userId, sessionId, deviceId } = req.auth;
    try {
      const result = await auditedWrite(
        this.db,
        this.clock,
        req,
        { userId, sessionId, deviceId, action, entityType: 'lost_order', entityId: id },
        async (tx) => {
          const [lost] = await tx.select().from(lostOrders).where(eq(lostOrders.id, id)).for('update');
          if (!lost) throw new AppError('NOT_FOUND', 'Esa orden perdida no existe.');
          if (lost.status !== 'pending')
            throw new AppError(
              'VALIDATION_ERROR',
              `La orden ${lost.number} ya se ${lost.status === 'recovered' ? 'recuperó' : 'descartó'}.`,
            );
          const done = await fn(tx, lost);
          const [row] = await tx
            .select({ l: lostOrders, resolvedBy: resolvers.fullName })
            .from(lostOrders)
            .leftJoin(resolvers, eq(resolvers.id, lostOrders.resolvedBy))
            .where(eq(lostOrders.id, id));
          const p = row!.l.payload as Payload;
          const current = p.versions.find((v) => v.id === p.order.currentVersionId) ?? p.versions.at(-1)!;
          const [issuer] = current.issuedBy
            ? await tx.select({ name: users.fullName }).from(users).where(eq(users.id, current.issuedBy))
            : [];
          return {
            status: 200,
            body: dtoOf(row!.l, row!.resolvedBy, issuer?.name ?? null),
            entityId: done.entityId,
            after: done.after,
            reason: done.reason,
          };
        },
      );
      res.status(result.status).json(result.body);
    } catch (err) {
      // RF-RES-07: si no se pudo recuperar, el motivo queda en la lista.
      if (err instanceof AppError && action === 'order.recover' && err.code !== 'NOT_FOUND')
        await this.db.update(lostOrders).set({ lastError: err.message }).where(eq(lostOrders.id, id));
      throw err;
    }
  }
}
