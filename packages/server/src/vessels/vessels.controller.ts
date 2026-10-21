// T062 y T068 · RF-BUQ-01 a 09, plan §5.11 y §6.2 (Buques): todos los leen; Apoderadas y Operadores los crean, editan
// (el total con motivo), registran el arribo, dan destino al sobrante (la merma, solo Apoderada) y los cierran.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import {
  AppError,
  compareTons,
  formatTons,
  havanaDate,
  parseTons,
  tonsToApi,
  vesselCode,
  type Clock,
  type Tons,
} from '@impocaribe/shared';
import {
  arrivalDateIssue,
  arrivalSchema,
  closeVesselSchema,
  editVesselSchema,
  surplusDispositionSchema,
  vesselDtoSchema,
  vesselHistorySchema,
  vesselSchema,
  vesselSurplusSchema,
  type VesselSurplus,
} from '@impocaribe/shared/validation';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { auditLog } from '../db/schema/audit.ts';
import { users } from '../db/schema/users.ts';
import { allocations, vessels, vesselSurplusDispositions } from '../db/schema/vessels.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { allocate, assertVesselOpen } from './allocate.ts';
import { assertVersion, EDITORS, writeVessels } from './declarations.controller.ts';
import { loadVessel, loadVessels, lockVessels } from './vessels.repo.ts';

const invalid = (field: string, message: string) =>
  new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', { fields: { [field]: message } });

/** RF-BUQ-03: el siguiente viaje del código en el año de arribo real. */
async function nextVoyage(tx: Tx, code: string, arrivalDate: string, selfId?: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${vessels.voyageNo})` })
    .from(vessels)
    .where(
      and(
        eq(vessels.code, code),
        sql`extract(year FROM ${vessels.arrivalDate}) = extract(year FROM ${arrivalDate}::date)`,
        selfId ? ne(vessels.id, selfId) : undefined,
      ),
    );
  return (row?.max ?? 0) + 1;
}

/** RF-BUQ-08: el sobrante del buque y sus destinos (los que dio y las transferencias que recibió). */
async function loadSurplus(tx: Tx, id: string): Promise<VesselSurplus> {
  const v = await loadVessel(tx, id);
  const rows = await tx
    .select({
      id: vesselSurplusDispositions.id,
      vesselId: vesselSurplusDispositions.vesselId,
      kind: vesselSurplusDispositions.kind,
      tons: vesselSurplusDispositions.tons,
      targetVesselId: vesselSurplusDispositions.targetVesselId,
      targetDeclarationId: allocations.declarationId,
      reason: vesselSurplusDispositions.reason,
      createdBy: users.fullName,
      createdAt: vesselSurplusDispositions.createdAt,
    })
    .from(vesselSurplusDispositions)
    .leftJoin(allocations, eq(allocations.id, vesselSurplusDispositions.targetAllocationId))
    .leftJoin(users, eq(users.id, vesselSurplusDispositions.createdBy))
    .where(or(eq(vesselSurplusDispositions.vesselId, id), eq(vesselSurplusDispositions.targetVesselId, id)))
    .orderBy(desc(vesselSurplusDispositions.createdAt));
  return {
    surplusTons: v.surplusTons,
    unresolvedTons: v.unresolvedSurplusTons,
    dispositions: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      tons: r.tons,
      incoming: r.vesselId !== id,
      otherVesselId: r.vesselId !== id ? r.vesselId : r.targetVesselId,
      targetDeclarationId: r.targetDeclarationId,
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

@Controller('vessels')
export class VesselsController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private today() {
    return havanaDate(this.clock.now());
  }

  @Get()
  @Contract({ output: z.array(vesselDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadVessels(tx));
  }

  @Get(':id')
  @Contract({ output: vesselDtoSchema, roles: ALL_ROLES })
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction((tx) => loadVessel(tx, id));
  }

  /** RF-BUQ-01 a 03: el código sale del nombre; si ya llegó, se le asigna el viaje. */
  @Post()
  @HttpCode(201)
  @Contract({ input: vesselSchema, output: vesselDtoSchema, roles: EDITORS })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(vesselSchema)) input: z.output<typeof vesselSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'vessel.create', entityType: 'vessel' },
      async (tx) => {
        const code = vesselCode(input.name);
        if (input.arrivalDate) {
          const issue = arrivalDateIssue(input.arrivalDate, this.today());
          if (issue) throw invalid('arrivalDate', issue);
          // Dos altas a la vez del mismo código y año no deben llevarse el mismo viaje.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`impocaribe.voyage.${code}`}))`);
        }
        const [v] = await tx
          .insert(vessels)
          .values({
            ...input,
            code,
            voyageNo: input.arrivalDate ? await nextVoyage(tx, code, input.arrivalDate) : null,
            createdAt: this.clock.now(),
            updatedAt: this.clock.now(),
          })
          .returning({ id: vessels.id });
        return { id: v!.id, body: (t) => loadVessel(t, v!.id), touched: { vessels: [v!.id] } };
      },
      201,
    );
  }

  /** RF-BUQ-05: el total no baja de lo asignado (ni de lo que ya salió) y su cambio pide motivo. */
  @Patch(':id')
  @Contract({
    input: editVesselSchema,
    output: vesselDtoSchema,
    errors: ['STALE_RECORD', 'TOTAL_BELOW_ALLOCATED', 'TOTAL_BELOW_LOADED', 'REASON_REQUIRED', 'FIELD_IMMUTABLE'],
    roles: EDITORS,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editVesselSchema)) input: z.output<typeof editVesselSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'vessel.edit', entityType: 'vessel', entityId: id },
      async (tx) => {
        const [row] = await lockVessels(tx, [id]);
        assertVersion(row!, input.expectedVersion);
        const before = await loadVessel(tx, id);
        const code = vesselCode(input.name);
        // El código fija la numeración: tras el arribo real el nombre solo cambia si da el mismo código.
        if (row!.arrivalDate && code !== row!.code)
          throw new AppError(
            'FIELD_IMMUTABLE',
            `El buque ya llegó: su nombre debe seguir dando el código ${row!.code}, que fija la numeración.`,
            { fields: { name: `Debe dar el código ${row!.code}.` } },
          );
        const total = parseTons(input.totalTons);
        const totalChanged = compareTons(total, parseTons(row!.totalTons)) !== 0;
        if (totalChanged) {
          if (!input.reason)
            throw new AppError('REASON_REQUIRED', 'Escriba el motivo del cambio del total.', {
              fields: { reason: 'Escriba el motivo: es obligatorio y queda en la bitácora.' },
            });
          assertVesselOpen(row!);
          const floor = parseTons(before.allocatedTons).plus(parseTons(before.disposedOutTons)) as Tons;
          if (compareTons(total, floor) < 0)
            throw new AppError(
              'TOTAL_BELOW_ALLOCATED',
              `El total no puede ser menor que lo asignado (${formatTons(floor)}).`,
              { allocatedTons: tonsToApi(floor), fields: { totalTons: `Como mínimo ${formatTons(floor)}.` } },
            );
          const loaded = parseTons(before.loadedTons);
          if (compareTons(total, loaded) < 0)
            throw new AppError(
              'TOTAL_BELOW_LOADED',
              `El total no puede ser menor que lo cargado (${formatTons(loaded)}).`,
            );
        }
        await tx
          .update(vessels)
          .set({
            name: input.name,
            code,
            manifest: input.manifest,
            bl: input.bl,
            port: input.port,
            internalBuyer: input.internalBuyer,
            etaDate: input.etaDate,
            totalTons: input.totalTons,
            rowVersion: row!.rowVersion + 1,
            updatedAt: this.clock.now(),
          })
          .where(eq(vessels.id, id));
        return {
          id,
          before,
          ...(totalChanged && input.reason ? { reason: input.reason } : {}),
          body: (t) => loadVessel(t, id),
          touched: { vessels: [id] },
        };
      },
    );
  }

  /** RF-BUQ-03, 04, 07: registrar o corregir (con motivo) el arribo real; con órdenes ya no cambia. */
  @Post(':id/arrival')
  @Contract({
    input: arrivalSchema,
    output: vesselDtoSchema,
    errors: ['STALE_RECORD', 'ARRIVAL_DATE_LOCKED', 'REASON_REQUIRED'],
    roles: EDITORS,
  })
  async arrival(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(arrivalSchema)) input: z.output<typeof arrivalSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'vessel.arrival', entityType: 'vessel', entityId: id },
      async (tx) => {
        const [found] = await tx.select({ code: vessels.code }).from(vessels).where(eq(vessels.id, id));
        if (!found) throw new AppError('NOT_FOUND', 'El buque no existe.');
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`impocaribe.voyage.${found.code}`}))`);
        const [row] = await lockVessels(tx, [id]);
        assertVersion(row!, input.expectedVersion);
        const issue = arrivalDateIssue(input.arrivalDate, this.today());
        if (issue) throw invalid('arrivalDate', issue);
        const before = await loadVessel(tx, id);
        if (row!.arrivalDate === input.arrivalDate) throw invalid('arrivalDate', 'Es la misma fecha que ya tiene.');
        if (row!.arrivalDate) {
          if (row!.lastOrderSeq > 0)
            throw new AppError(
              'ARRIVAL_DATE_LOCKED',
              'El buque ya tiene órdenes emitidas: su fecha de arribo real fija el año y el viaje de números ya impresos.',
            );
          if (!input.reason)
            throw new AppError('REASON_REQUIRED', 'Escriba el motivo de la corrección de la fecha de arribo real.', {
              fields: { reason: 'Escriba el motivo: es obligatorio y queda en la bitácora.' },
            });
        }
        const sameYear = row!.arrivalDate?.slice(0, 4) === input.arrivalDate.slice(0, 4);
        await tx
          .update(vessels)
          .set({
            arrivalDate: input.arrivalDate,
            voyageNo: sameYear ? row!.voyageNo : await nextVoyage(tx, row!.code, input.arrivalDate, id),
            rowVersion: row!.rowVersion + 1,
            updatedAt: this.clock.now(),
          })
          .where(eq(vessels.id, id));
        return {
          id,
          before,
          ...(input.reason ? { reason: input.reason } : {}),
          body: (t) => loadVessel(t, id),
          touched: { vessels: [id] },
        };
      },
    );
  }

  @Get(':id/surplus')
  @Contract({ output: vesselSurplusSchema, roles: ALL_ROLES })
  surplus(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction((tx) => loadSurplus(tx, id));
  }

  /**
   * RF-BUQ-08, 09: un destino para el sobrante. Asignar va por el flujo normal (nunca parcial); transferir suma las
   * toneladas al total del buque destino; la merma solo la registra una Apoderada. Lo transferido o perdido sale de lo
   * libre del buque: lo asignado y no cargado se destina después de reducir esa asignación.
   */
  @Post(':id/surplus-dispositions')
  @HttpCode(201)
  @Contract({
    input: surplusDispositionSchema,
    output: vesselSurplusSchema,
    errors: [
      'VESSEL_CLOSED',
      'ALLOCATION_EXCEEDS_VESSEL',
      'ALLOCATION_EXCEEDS_DECLARATION',
      'DECLARATION_PENDING_TOTAL',
      'DECLARATION_EXPIRED',
      'DECLARATION_CLOSED',
    ],
    roles: EDITORS,
  })
  async dispose(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(surplusDispositionSchema)) input: z.output<typeof surplusDispositionSchema>,
  ) {
    if (input.kind === 'loss' && req.auth.role !== 'apoderada')
      throw new AppError('FORBIDDEN', 'Solo una Apoderada puede registrar una merma.');
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: `vessel.surplus.${input.kind}`, entityType: 'vessel', entityId: id },
      async (tx) => {
        const targetId = input.kind === 'transfer' ? input.targetVesselId! : undefined;
        if (targetId === id) throw invalid('targetVesselId', 'Elija otro buque: no se transfiere al mismo.');
        // DT-09: los dos buques, en orden de id (dos transferencias cruzadas no se interbloquean).
        const locked = await lockVessels(tx, targetId ? [id, targetId] : [id]);
        const before = await loadVessel(tx, id);
        const wanted = parseTons(input.tons);
        const unresolved = parseTons(before.unresolvedSurplusTons);
        if (compareTons(wanted, unresolved) > 0)
          throw invalid('tons', `Supera el sobrante sin destino (${formatTons(unresolved)}).`);
        let targetAllocationId: string | null = null;
        const touchedDeclarations: string[] = [];
        if (input.kind === 'allocate') {
          const done = await allocate(tx, this.clock, {
            declarationId: input.targetDeclarationId!,
            vesselId: id,
            tons: input.tons,
            reason: input.reason,
            userId: req.auth.userId,
            surplus: true,
          });
          targetAllocationId = done.allocationId;
          touchedDeclarations.push(input.targetDeclarationId!);
        } else {
          const free = parseTons(before.freeTons);
          if (compareTons(wanted, free) > 0)
            throw invalid(
              'tons',
              `Solo hay ${formatTons(free)} libres: lo asignado y no cargado se destina después de reducir esa asignación.`,
            );
        }
        if (targetId) {
          const target = locked.find((v) => v.id === targetId)!;
          if (target.status === 'closed')
            throw new AppError('VESSEL_CLOSED', `El buque ${target.name} está cerrado: no recibe transferencias.`, {
              fields: { targetVesselId: 'Elija un buque abierto.' },
            });
          await tx
            .update(vessels)
            .set({
              totalTons: tonsToApi(parseTons(target.totalTons).plus(wanted) as Tons),
              rowVersion: target.rowVersion + 1,
              updatedAt: this.clock.now(),
            })
            .where(eq(vessels.id, targetId));
        }
        await tx.insert(vesselSurplusDispositions).values({
          vesselId: id,
          tons: input.tons,
          kind: input.kind,
          targetVesselId: targetId ?? null,
          targetAllocationId,
          reason: input.reason,
          createdBy: req.auth.userId,
          createdAt: this.clock.now(),
        });
        // El buque de origen cambia de saldos (no de datos): su versión también sube, para que una edición abierta
        // con los saldos de antes no se guarde a ciegas.
        await tx
          .update(vessels)
          .set({ rowVersion: sql`${vessels.rowVersion} + 1`, updatedAt: this.clock.now() })
          .where(eq(vessels.id, id));
        return {
          id,
          before,
          reason: input.reason,
          body: (t) => loadSurplus(t, id),
          touched: { vessels: targetId ? [id, targetId] : [id], declarations: touchedDeclarations },
        };
      },
      201,
    );
  }

  /** RF-BUQ-08: solo con todo el sobrante con destino. */
  @Post(':id/close')
  @Contract({
    input: closeVesselSchema,
    output: vesselDtoSchema,
    errors: ['STALE_RECORD', 'SURPLUS_UNRESOLVED', 'VESSEL_CLOSED'],
    roles: EDITORS,
  })
  async close(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeVesselSchema)) input: z.output<typeof closeVesselSchema>,
  ) {
    await writeVessels(
      this.db,
      this.clock,
      req,
      res,
      { action: 'vessel.close', entityType: 'vessel', entityId: id },
      async (tx) => {
        const [row] = await lockVessels(tx, [id]);
        assertVersion(row!, input.expectedVersion);
        assertVesselOpen(row!);
        const before = await loadVessel(tx, id);
        const unresolved = parseTons(before.unresolvedSurplusTons);
        if (!unresolved.isZero())
          throw new AppError(
            'SURPLUS_UNRESOLVED',
            `Faltan ${formatTons(unresolved)} de sobrante por darle destino antes de cerrar el buque.`,
            { unresolvedTons: before.unresolvedSurplusTons },
          );
        await tx
          .update(vessels)
          .set({
            status: 'closed',
            closedAt: this.clock.now(),
            closedBy: req.auth.userId,
            rowVersion: row!.rowVersion + 1,
            updatedAt: this.clock.now(),
          })
          .where(eq(vessels.id, id));
        return { id, before, body: (t) => loadVessel(t, id), touched: { vessels: [id] } };
      },
    );
  }

  /** P-08, historial: la bitácora del buque, de lo más reciente a lo más antiguo. */
  @Get(':id/history')
  @Contract({ output: vesselHistorySchema, roles: ALL_ROLES })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction(async (tx) => {
      await loadVessel(tx, id);
      const rows = await tx
        .select({
          action: auditLog.action,
          after: auditLog.after,
          userName: users.fullName,
          at: auditLog.at,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .where(and(eq(auditLog.entityType, 'vessel'), eq(auditLog.entityId, id), eq(auditLog.ok, true)))
        .orderBy(desc(auditLog.id))
        .limit(200);
      return rows.map((r) => ({
        action: r.action,
        reason: (r.after as { reason?: string } | null)?.reason ?? null,
        userName: r.userName,
        at: r.at.toISOString(),
      }));
    });
  }
}
