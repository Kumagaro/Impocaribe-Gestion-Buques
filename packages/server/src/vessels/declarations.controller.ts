// T063, T064 y T067 · RF-DM-01 a 05, RF-ASG-01 a 03, RF-PLZ-04, D6, D11, D13, plan §5.5 a 5.7 y §6.2 (DM): todos las
// leen; Apoderadas y Operadores las crean, editan (con versión y motivo), asignan y reactivan. Cada escritura deja su
// bitácora, es idempotente y replica el DTO de la DM y de los buques que toca.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import {
  AppError,
  compareTons,
  formatTons,
  havanaDate,
  parseTons,
  tonsToApi,
  type Clock,
  type Tons,
} from '@impocaribe/shared';
import {
  allocationDtoSchema,
  allocationSchema,
  declarationDtoSchema,
  declarationHistorySchema,
  declarationSchema,
  editAllocationSchema,
  editDeclarationSchema,
  reactivateDeclarationSchema,
  trackingFileSchema,
} from '@impocaribe/shared/validation';
import { desc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { clients } from '../db/schema/catalogs.ts';
import { users } from '../db/schema/users.ts';
import {
  allocationChanges,
  allocations,
  customsDeclarations,
  customsDeclarationVersions,
  vAllocationBalance,
  vessels,
  vVesselBalance,
} from '../db/schema/vessels.ts';
import { loadOrders } from '../db/schema/orders.ts';
import { PdfService } from '../orders/pdf-engine.ts';
import { readOrders } from '../orders/orders.repo.ts';
import { trackingHtml } from './tracking.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { raiseEvent } from '../alerts/alerts.ts';
import { openDeclarations } from '../alerts/conditions.ts';
import { allocate, assertDeclarationOpen, assertVesselOpen, statusNow } from './allocate.ts';
import { releaseToLoaded } from './expiry.ts';
import {
  addVersion,
  currentVersion,
  loadDeclaration,
  loadDeclarations,
  lockDeclaration,
  lockVessels,
  replicate,
  vesselsOfDeclaration,
} from './vessels.repo.ts';

export const EDITORS = ['apoderada', 'operador'] as const;

const ALLOCATION_ERRORS = [
  'DECLARATION_PENDING_TOTAL',
  'DECLARATION_EXPIRED',
  'DECLARATION_CLOSED',
  'VESSEL_CLOSED',
  'ALLOCATION_EXCEEDS_VESSEL',
  'ALLOCATION_EXCEEDS_DECLARATION',
] as const;

const tonsOf = (s: string | null) => (s === null ? null : parseTons(s));

/** DT-23: la versión que vio el usuario. */
export function assertVersion(row: { rowVersion: number }, expected: number) {
  if (row.rowVersion !== expected)
    throw new AppError(
      'STALE_RECORD',
      'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
      { currentVersion: row.rowVersion },
    );
}

/** Lo común de las escrituras de buques y DM: bitácora, idempotencia y réplica de lo tocado. */
export async function writeVessels(
  db: NodePgDatabase,
  clock: Clock,
  req: AuthedRequest,
  res: Response,
  entry: { action: string; entityType: 'vessel' | 'declaration'; entityId?: string },
  fn: (tx: Tx) => Promise<{
    id: string;
    body: (tx: Tx) => Promise<unknown>;
    before?: unknown;
    reason?: string;
    touched: { vessels?: string[]; declarations?: string[] };
  }>,
  status = 200,
) {
  const result = await auditedWrite(
    db,
    clock,
    req,
    {
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
      deviceId: req.auth.deviceId,
      ...entry,
    },
    async (tx) => {
      const done = await fn(tx);
      const body = await done.body(tx);
      await replicate(tx, clock, done.touched);
      return {
        status,
        body,
        entityId: done.id,
        before: done.before,
        after: done.reason ? { ...(body as object), reason: done.reason } : body,
        reason: done.reason,
      };
    },
  );
  res.status(result.status).json(result.body);
}

@Controller('declarations')
export class DeclarationsController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PdfService) private readonly pdf: PdfService,
  ) {}

  @Get()
  @Contract({ output: z.array(declarationDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadDeclarations(tx));
  }

  @Get(':id')
  @Contract({ output: declarationDtoSchema, roles: ALL_ROLES })
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction((tx) => loadDeclaration(tx, id));
  }

  /** T103 · RF-TAB-06: el seguimiento de la DM en PDF. */
  @Get(':id/tracking.pdf')
  @Contract({ output: trackingFileSchema, errors: ['PDF_RENDER_FAILED'], roles: ALL_ROLES })
  async tracking(@Param('id', ParseUUIDPipe) id: string): Promise<z.infer<typeof trackingFileSchema>> {
    const data = await this.db.transaction(
      async (tx) => {
        const declaration = await loadDeclaration(tx, id);
        const [client] = await tx
          .select({ name: clients.name })
          .from(clients)
          .where(eq(clients.id, declaration.clientId));
        const vesselRows = declaration.allocations.length
          ? await tx
              .select({ id: vessels.id, name: vessels.name })
              .from(vessels)
              .where(
                inArray(
                  vessels.id,
                  declaration.allocations.map((a) => a.vesselId),
                ),
              )
          : [];
        const orderIds = await tx
          .select({ id: loadOrders.id })
          .from(loadOrders)
          .where(eq(loadOrders.declarationId, id));
        return {
          declaration,
          clientName: client!.name,
          vesselNames: Object.fromEntries(vesselRows.map((v) => [v.id, v.name])),
          orders: orderIds.length ? await readOrders(tx, { ids: orderIds.map((o) => o.id) }) : [],
        };
      },
      { accessMode: 'read only' },
    );
    let pdf: Buffer;
    try {
      pdf = await this.pdf.render(trackingHtml(data, this.clock));
    } catch (err) {
      throw new AppError('PDF_RENDER_FAILED', 'No se pudo generar el seguimiento en PDF. Inténtelo de nuevo.', {
        cause: String(err),
      });
    }
    return {
      fileName: `seguimiento-DM-${data.declaration.number}.pdf`,
      mime: 'application/pdf',
      base64: pdf.toString('base64'),
    };
  }

  /** RF-DM-01 a 03: la fecha la pone el servidor; la asignación inicial es opcional. */
  @Post()
  @HttpCode(201)
  @Contract({
    input: declarationSchema,
    output: declarationDtoSchema,
    errors: ['DUPLICATE_DM_NUMBER', ...ALLOCATION_ERRORS],
    roles: EDITORS,
  })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(declarationSchema)) input: z.output<typeof declarationSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'declaration.create', entityType: 'declaration' },
      async (tx) => {
        // DT-09: el buque de la asignación inicial se bloquea antes que la DM.
        if (input.allocation) await lockVessels(tx, [input.allocation.vesselId]);
        const [same] = await tx
          .select({ id: customsDeclarations.id })
          .from(customsDeclarations)
          .where(eq(customsDeclarations.number, input.number));
        if (same) throw duplicate(input.number);
        const [client] = await tx
          .select({ name: clients.name, active: clients.active })
          .from(clients)
          .where(eq(clients.id, input.clientId));
        if (!client?.active)
          throw new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', {
            fields: { clientId: client ? `El cliente «${client.name}» está inactivo.` : 'Elija el cliente.' },
          });
        const today = havanaDate(this.clock.now());
        const [d] = await tx
          .insert(customsDeclarations)
          .values({
            number: input.number,
            clientId: input.clientId,
            declarationDate: today,
            deadlineStartDate: today,
            createdAt: this.clock.now(),
          })
          .returning({ id: customsDeclarations.id })
          .catch((err: unknown) => {
            throw isUnique(err) ? duplicate(input.number) : err;
          });
        // La versión inicial no cuenta como cambio de la fila: row_version sigue en 1.
        await addVersion(
          tx,
          this.clock,
          d!.id,
          { brand: input.brand, totalTons: input.totalTons, kind: 'create', reason: null, createdBy: req.auth.userId },
          { rowVersion: 1 },
        );
        let partialReason: string | undefined;
        if (input.allocation) {
          const done = await allocate(tx, this.clock, {
            ...input.allocation,
            declarationId: d!.id,
            userId: req.auth.userId,
          });
          if (done.partial) partialReason = input.allocation.reason;
        }
        // AL-02: se registró mientras había otras pendientes (RF-DM-10); se listan.
        const others = (await openDeclarations(tx, this.clock.now())).filter((o) => o.pending && o.id !== d!.id);
        if (others.length)
          await raiseEvent(tx, this.clock, {
            type: 'AL-02',
            title: `DM ${input.number} registrada con ${others.length} pendiente${others.length === 1 ? '' : 's'}`,
            detail: `Pendientes: ${others.map((o) => o.number).join(', ')}.`,
            entity: { type: 'declaration', id: d!.id },
            payload: { pending: others.map((o) => ({ id: o.id, number: o.number })) },
          });
        return {
          id: d!.id,
          body: (t) => loadDeclaration(t, d!.id),
          ...(partialReason ? { reason: partialReason } : {}),
          touched: { declarations: [d!.id], vessels: input.allocation ? [input.allocation.vesselId] : [] },
        };
      },
      201,
    );
  }

  /** RF-DM-04, 05, D6, D11: solo el total y la marca, con motivo; el total no baja de lo cargado ni de lo asignado. */
  @Post(':id/versions')
  @Contract({
    input: editDeclarationSchema,
    output: declarationDtoSchema,
    errors: ['STALE_RECORD', 'TOTAL_BELOW_LOADED', 'TOTAL_BELOW_ALLOCATED'],
    roles: EDITORS,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editDeclarationSchema)) input: z.output<typeof editDeclarationSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'declaration.edit', entityType: 'declaration', entityId: id },
      async (tx) => {
        await lockVessels(tx, await vesselsOfDeclaration(tx, id));
        const row = await lockDeclaration(tx, id);
        assertVersion(row, input.expectedVersion);
        const before = await loadDeclaration(tx, id);
        const total = tonsOf(input.totalTons);
        const loaded = parseTons(before.loadedTons);
        const allocated = parseTons(before.allocatedTons);
        if (total === null && !allocated.isZero())
          throw new AppError(
            'TOTAL_BELOW_ALLOCATED',
            `La DM tiene ${formatTons(allocated)} asignadas: no puede quedar sin total (D11).`,
            { allocatedTons: before.allocatedTons, fields: { totalTons: 'Escriba el total.' } },
          );
        if (total && compareTons(total, loaded) < 0)
          throw new AppError(
            'TOTAL_BELOW_LOADED',
            `El total no puede ser menor que lo ya cargado (${formatTons(loaded)}).`,
            { loadedTons: before.loadedTons, fields: { totalTons: `Como mínimo ${formatTons(loaded)}.` } },
          );
        if (total && compareTons(total, allocated) < 0)
          throw new AppError(
            'TOTAL_BELOW_ALLOCATED',
            `El total no puede ser menor que lo asignado (${formatTons(allocated)}): reduzca antes las asignaciones.`,
            { allocatedTons: before.allocatedTons, fields: { totalTons: `Como mínimo ${formatTons(allocated)}.` } },
          );
        await addVersion(tx, this.clock, id, {
          brand: input.brand,
          totalTons: input.totalTons,
          kind: 'edit',
          reason: input.reason,
          createdBy: req.auth.userId,
        });
        return {
          id,
          before,
          reason: input.reason,
          body: (t) => loadDeclaration(t, id),
          touched: { declarations: [id] },
        };
      },
    );
  }

  /** RF-PLZ-04, D7: el plazo empieza de nuevo hoy y lo restante queda pendiente de asignar. */
  @Post(':id/reactivate')
  @Contract({
    input: reactivateDeclarationSchema,
    output: declarationDtoSchema,
    errors: ['STALE_RECORD'],
    roles: EDITORS,
  })
  async reactivate(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reactivateDeclarationSchema)) input: z.output<typeof reactivateDeclarationSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'declaration.reactivate', entityType: 'declaration', entityId: id },
      async (tx) => {
        const vesselIds = await vesselsOfDeclaration(tx, id);
        await lockVessels(tx, vesselIds);
        const row = await lockDeclaration(tx, id);
        assertVersion(row, input.expectedVersion);
        const before = await loadDeclaration(tx, id);
        if (statusNow(before, row, this.clock) !== 'expired')
          throw new AppError('VALIDATION_ERROR', `La DM ${before.number} no está vencida: no hace falta reactivarla.`);
        // Si la tarea de vencimiento aún no pasó, el restante se libera ahora (RF-PLZ-03).
        if (!row.expiredAt)
          await releaseToLoaded(tx, this.clock, id, 'Reactivación de una DM vencida.', req.auth.userId);
        const version = await currentVersion(tx, row.currentVersionId!);
        await addVersion(
          tx,
          this.clock,
          id,
          {
            brand: version.brand,
            totalTons: version.totalTons,
            kind: 'reactivate',
            reason: input.reason,
            createdBy: req.auth.userId,
          },
          { deadlineStartDate: havanaDate(this.clock.now()), expiredAt: null },
        );
        return {
          id,
          before,
          reason: input.reason,
          body: (t) => loadDeclaration(t, id),
          touched: { declarations: [id], vessels: vesselIds },
        };
      },
    );
  }

  @Get(':id/history')
  @Contract({ output: declarationHistorySchema, roles: ALL_ROLES })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction(async (tx) => {
      await loadDeclaration(tx, id);
      const versions = await tx
        .select({
          versionNo: customsDeclarationVersions.versionNo,
          kind: customsDeclarationVersions.kind,
          brand: customsDeclarationVersions.brand,
          totalTons: customsDeclarationVersions.totalTons,
          reason: customsDeclarationVersions.reason,
          createdBy: users.fullName,
          createdAt: customsDeclarationVersions.createdAt,
        })
        .from(customsDeclarationVersions)
        .leftJoin(users, eq(users.id, customsDeclarationVersions.createdBy))
        .where(eq(customsDeclarationVersions.declarationId, id))
        .orderBy(desc(customsDeclarationVersions.versionNo));
      const changes = await tx
        .select({
          vesselId: allocations.vesselId,
          kind: allocationChanges.kind,
          previousTons: allocationChanges.previousTons,
          newTons: allocationChanges.newTons,
          reason: allocationChanges.reason,
          createdBy: users.fullName,
          createdAt: allocationChanges.createdAt,
        })
        .from(allocationChanges)
        .innerJoin(allocations, eq(allocations.id, allocationChanges.allocationId))
        .leftJoin(users, eq(users.id, allocationChanges.createdBy))
        .where(eq(allocations.declarationId, id))
        .orderBy(desc(allocationChanges.createdAt), desc(allocationChanges.id));
      return {
        versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
        allocationChanges: changes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      };
    });
  }

  /** RF-ASG-01, 02: asignar a un buque; si supera lo libre, solo con `confirmPartial` y motivo. */
  @Post(':id/allocations')
  @HttpCode(201)
  @Contract({ input: allocationSchema, output: declarationDtoSchema, errors: [...ALLOCATION_ERRORS], roles: EDITORS })
  async allocate(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(allocationSchema)) input: z.output<typeof allocationSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'allocation.assign', entityType: 'declaration', entityId: id },
      async (tx) => {
        const done = await allocate(tx, this.clock, { ...input, declarationId: id, userId: req.auth.userId });
        return {
          id,
          ...(done.partial && input.reason ? { reason: input.reason } : {}),
          body: (t) => loadDeclaration(t, id),
          touched: { declarations: [id], vessels: [input.vesselId] },
        };
      },
      201,
    );
  }
}

@Controller('allocations')
export class AllocationsController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** RF-ASG-03: no baja de lo cargado; si sube, cabe en el buque y en la DM. Cada cambio pide motivo. */
  @Patch(':id')
  @Contract({
    input: editAllocationSchema,
    output: allocationDtoSchema,
    errors: ['STALE_RECORD', 'TOTAL_BELOW_LOADED', ...ALLOCATION_ERRORS],
    roles: EDITORS,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editAllocationSchema)) input: z.output<typeof editAllocationSchema>,
  ) {
    const [found] = await this.db
      .select({ vesselId: allocations.vesselId, declarationId: allocations.declarationId })
      .from(allocations)
      .where(eq(allocations.id, id));
    if (!found) throw new AppError('NOT_FOUND', 'La asignación no existe.');
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'allocation.edit', entityType: 'declaration', entityId: found.declarationId },
      async (tx) => {
        const [vesselRow] = await lockVessels(tx, [found.vesselId]);
        const declarationRow = await lockDeclaration(tx, found.declarationId);
        const [row] = await tx.select().from(allocations).where(eq(allocations.id, id)).for('update');
        assertVersion(row!, input.expectedVersion);
        const [balance] = await tx.select().from(vAllocationBalance).where(eq(vAllocationBalance.allocationId, id));
        const previous = parseTons(row!.allocatedTons);
        const next = parseTons(input.tons);
        const loaded = parseTons(balance!.loadedTons);
        if (compareTons(next, loaded) < 0)
          throw new AppError(
            'TOTAL_BELOW_LOADED',
            `La asignación no puede bajar de lo ya cargado contra ella (${formatTons(loaded)}).`,
            { loadedTons: balance!.loadedTons, fields: { tons: `Como mínimo ${formatTons(loaded)}.` } },
          );
        if (compareTons(next, previous) > 0) {
          const declaration = await loadDeclaration(tx, found.declarationId);
          assertVesselOpen(vesselRow!);
          assertDeclarationOpen(declaration, declarationRow, this.clock);
          const extra = next.minus(previous);
          const pending = parseTons(declaration.pendingAllocationTons!);
          if (compareTons(extra as Tons, pending) > 0)
            throw new AppError(
              'ALLOCATION_EXCEEDS_DECLARATION',
              `La DM ${declaration.number} solo tiene ${formatTons(pending)} pendientes de asignar.`,
              { pendingTons: tonsToApi(pending) },
            );
          const [vessel] = await tx
            .select({ freeTons: vVesselBalance.freeTons })
            .from(vVesselBalance)
            .where(eq(vVesselBalance.vesselId, found.vesselId));
          const freeTons = parseTons(vessel!.freeTons);
          if (compareTons(extra as Tons, freeTons) > 0)
            throw new AppError('ALLOCATION_EXCEEDS_VESSEL', `El buque solo tiene ${formatTons(freeTons)} libres.`, {
              excessTons: tonsToApi(extra.minus(freeTons) as Tons),
              freeTons: tonsToApi(freeTons),
            });
        }
        await tx
          .update(allocations)
          .set({ allocatedTons: input.tons, rowVersion: row!.rowVersion + 1, updatedAt: this.clock.now() })
          .where(eq(allocations.id, id));
        await tx.insert(allocationChanges).values({
          allocationId: id,
          previousTons: row!.allocatedTons,
          newTons: input.tons,
          kind: 'edit',
          reason: input.reason,
          createdBy: req.auth.userId,
          createdAt: this.clock.now(),
        });
        return {
          id: found.declarationId,
          before: { allocationId: id, allocatedTons: row!.allocatedTons },
          reason: input.reason,
          body: async (t) => (await loadDeclaration(t, found.declarationId)).allocations.find((a) => a.id === id),
          touched: { declarations: [found.declarationId], vessels: [found.vesselId] },
        };
      },
    );
  }
}

function duplicate(number: string) {
  const message = `La DM ${number} ya existe: el número de DM no se repite nunca (RF-DM-02).`;
  return new AppError('DUPLICATE_DM_NUMBER', message, { fields: { number: message } });
}

function isUnique(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}
