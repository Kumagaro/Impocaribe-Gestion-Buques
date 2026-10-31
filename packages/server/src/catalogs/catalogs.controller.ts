// T055 y T056 · RF-CAT-01 a 10, F-11 a F-13, plan §6.2 (Catálogos): todos los leen; Apoderadas y Operadores los crean,
// editan, activan y desactivan (nada se borra, RF-CAT-07). Cada escritura deja su bitácora y replica el DTO completo.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { AppError, normalizeName, type Clock } from '@impocaribe/shared';
import {
  carrierDtoSchema,
  carrierSchema,
  changeDriverCarrierSchema,
  clientDtoSchema,
  clientSchema,
  driverDtoSchema,
  driverSchema,
  editCarrierSchema,
  editClientSchema,
  editDriverSchema,
  editTrailerSchema,
  editTruckSchema,
  trailerDtoSchema,
  trailerSchema,
  truckDtoSchema,
  truckSchema,
} from '@impocaribe/shared/validation';
import { and, eq, inArray, max, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Response } from 'express';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import {
  carriers,
  clients,
  drivers,
  recipients,
  trailers,
  truckDefaultTrailers,
  trucks,
} from '../db/schema/catalogs.ts';
import { updateVersioned } from '../db/versioned.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { loadCatalog, loadOne, replicate, type CatalogEntity } from './catalogs.repo.ts';

const EDITORS = ['apoderada', 'operador'] as const;

const invalid = (field: string, message: string) =>
  new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', { fields: { [field]: message } });
const duplicatePlate = (kind: string, plate: string) => {
  const message = `Ya existe ${kind} con la chapa ${plate}.`;
  return new AppError('DUPLICATE_PLATE', message, { fields: { plate: message } });
};

/** La restricción única que violó una escritura, si fue eso (respaldo de las comprobaciones previas). */
function uniqueConstraint(err: unknown): string | undefined {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.code === '23505' ? e : e.cause;
  return pg?.code === '23505' ? pg.constraint : undefined;
}

/** Lo común de los cinco controladores: escribir con bitácora, idempotencia y réplica, y activar o desactivar. */
abstract class CatalogController {
  constructor(
    @Inject(DB) protected readonly db: NodePgDatabase,
    @Inject(CLOCK) protected readonly clock: Clock,
  ) {}

  protected abstract readonly entity: CatalogEntity;

  /** `fn` hace el cambio y dice qué registro tocó (y qué cambió además, para replicarlo). */
  protected async write(
    req: AuthedRequest,
    res: Response,
    action: string,
    id: string | null,
    fn: (
      tx: Tx,
    ) => Promise<{ id: string; before?: unknown; reason?: string; also?: { entity: CatalogEntity; id: string }[] }>,
    status = 200,
  ): Promise<void> {
    const entry = {
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
      deviceId: req.auth.deviceId,
      action,
      entityType: this.entity,
    };
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      { ...entry, ...(id ? { entityId: id } : {}) },
      async (tx) => {
        const done = await fn(tx).catch((err: unknown) => {
          throw this.unique(uniqueConstraint(err)) ?? err;
        });
        const after = await loadOne(tx, this.entity, done.id);
        await replicate(tx, this.clock, [{ entity: this.entity, id: done.id }, ...(done.also ?? [])]);
        return { status, body: after, entityId: done.id, before: done.before, after };
      },
    );
    res.status(result.status).json(result.body);
  }

  /** El mensaje de una restricción única violada en una carrera que las comprobaciones previas no vieron. */
  protected unique(constraint: string | undefined): AppError | undefined {
    return constraint
      ? invalid('name', 'Ese dato ya existe en otro registro: revíselo y vuelva a guardar.')
      : undefined;
  }

  protected toggle(req: AuthedRequest, res: Response, table: PgTable & typeof carriers, id: string, active: boolean) {
    return this.write(req, res, `${this.entity}.${active ? 'activate' : 'deactivate'}`, id, async (tx) => {
      const [row] = await tx
        .update(table)
        .set({ active, rowVersion: sql`${table.rowVersion} + 1`, updatedAt: this.clock.now() } as never)
        .where(eq(table.id, id))
        .returning({ id: table.id });
      if (!row) throw new AppError('NOT_FOUND', 'El registro no existe.');
      return { id, before: { active: !active } };
    });
  }

  /** El transportista de un camión, remolque o chofer: debe existir y estar activo (F-13). */
  protected async activeCarrier(tx: Tx, carrierId: string): Promise<void> {
    const [c] = await tx
      .select({ name: carriers.name, active: carriers.active })
      .from(carriers)
      .where(eq(carriers.id, carrierId));
    if (!c) throw invalid('carrierId', 'Elija el transportista.');
    if (!c.active) throw invalid('carrierId', `El transportista «${c.name}» está inactivo: actívelo o elija otro.`);
  }

  /** RF-CAT-01 y 02: el nombre es único al normalizarlo; se nombra el registro que ya existe. */
  protected async uniqueName(
    tx: Tx,
    table: typeof clients | typeof carriers,
    kind: string,
    name: string,
    selfId?: string,
  ) {
    const [same] = await tx
      .select({ name: table.name })
      .from(table)
      .where(and(eq(table.nameNormalized, normalizeName(name)), selfId ? ne(table.id, selfId) : undefined));
    if (same) throw invalid('name', `Ya existe ${kind} «${same.name}»: es el mismo nombre escrito de otra forma.`);
  }
}

const now = (c: Clock) => ({ createdAt: c.now(), updatedAt: c.now() });

@Controller('clients')
export class ClientsController extends CatalogController {
  protected readonly entity = 'client' as const;

  @Get()
  @Contract({ output: z.array(clientDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadCatalog(tx, 'client'));
  }

  @Post()
  @HttpCode(201)
  @Contract({ input: clientSchema, output: clientDtoSchema, roles: EDITORS })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(clientSchema)) input: z.output<typeof clientSchema>,
  ) {
    await this.write(
      req,
      res,
      'client.create',
      null,
      async (tx) => {
        await this.uniqueName(tx, clients, 'el cliente', input.name);
        const [c] = await tx
          .insert(clients)
          .values({ name: input.name, nameNormalized: normalizeName(input.name), ...now(this.clock) })
          .returning({ id: clients.id });
        await this.saveRecipients(tx, c!.id, input.recipients);
        return { id: c!.id };
      },
      201,
    );
  }

  @Patch(':id')
  @Contract({ input: editClientSchema, output: clientDtoSchema, errors: ['STALE_RECORD'], roles: EDITORS })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editClientSchema)) input: z.output<typeof editClientSchema>,
  ) {
    await this.write(req, res, 'client.edit', id, async (tx) => {
      const before = await loadOne(tx, 'client', id);
      await this.uniqueName(tx, clients, 'el cliente', input.name, id);
      await updateVersioned(tx, clients, id, input.expectedVersion, {
        name: input.name,
        nameNormalized: normalizeName(input.name),
        updatedAt: this.clock.now(),
      });
      await this.saveRecipients(tx, id, input.recipients);
      return { id, before };
    });
  }

  // shortcut: RF-CAT-11 (no desactivar un cliente con DM abiertas) se comprueba cuando existan las DM, en F5 (T061).
  @Post(':id/deactivate')
  @Contract({ output: clientDtoSchema, roles: EDITORS })
  deactivate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, clients as never, id, false);
  }

  @Post(':id/activate')
  @Contract({ output: clientDtoSchema, roles: EDITORS })
  activate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, clients as never, id, true);
  }

  /** Los que traen id se actualizan (deben ser de este cliente); los nuevos se añaden al final. Ninguno se borra. */
  private async saveRecipients(tx: Tx, clientId: string, list: z.output<typeof clientSchema>['recipients']) {
    const [last] = await tx
      .select({ n: max(recipients.position) })
      .from(recipients)
      .where(eq(recipients.clientId, clientId));
    let position = last?.n ?? 0;
    for (const r of list) {
      if (r.id) {
        const [updated] = await tx
          .update(recipients)
          .set({ name: r.name, address: r.address, ...(r.active === undefined ? {} : { active: r.active }) })
          .where(and(eq(recipients.id, r.id), eq(recipients.clientId, clientId)))
          .returning({ id: recipients.id });
        if (!updated) throw new AppError('NOT_FOUND', 'Un destinatario no existe o es de otro cliente.');
      } else {
        await tx
          .insert(recipients)
          .values({ clientId, name: r.name, address: r.address, active: r.active ?? true, position: ++position });
      }
    }
  }
}

@Controller('carriers')
export class CarriersController extends CatalogController {
  protected readonly entity = 'carrier' as const;

  @Get()
  @Contract({ output: z.array(carrierDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadCatalog(tx, 'carrier'));
  }

  @Post()
  @HttpCode(201)
  @Contract({ input: carrierSchema, output: carrierDtoSchema, roles: EDITORS })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(carrierSchema)) input: z.output<typeof carrierSchema>,
  ) {
    await this.write(
      req,
      res,
      'carrier.create',
      null,
      async (tx) => {
        await this.uniqueName(tx, carriers, 'el transportista', input.name);
        const [c] = await tx
          .insert(carriers)
          .values({ name: input.name, nameNormalized: normalizeName(input.name), ...now(this.clock) })
          .returning({ id: carriers.id });
        return { id: c!.id };
      },
      201,
    );
  }

  @Patch(':id')
  @Contract({ input: editCarrierSchema, output: carrierDtoSchema, errors: ['STALE_RECORD'], roles: EDITORS })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editCarrierSchema)) input: z.output<typeof editCarrierSchema>,
  ) {
    await this.write(req, res, 'carrier.edit', id, async (tx) => {
      const before = await loadOne(tx, 'carrier', id);
      await this.uniqueName(tx, carriers, 'el transportista', input.name, id);
      await updateVersioned(tx, carriers, id, input.expectedVersion, {
        name: input.name,
        nameNormalized: normalizeName(input.name),
        updatedAt: this.clock.now(),
      });
      return { id, before };
    });
  }

  /** RF-CAT-10: sus camiones, remolques y choferes dejan de poder elegirse en órdenes nuevas (lo filtra la interfaz y
   * lo comprobará la emisión, F6); el aviso previo con cuántos son lo da la interfaz con la copia local. */
  @Post(':id/deactivate')
  @Contract({ output: carrierDtoSchema, roles: EDITORS })
  deactivate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, carriers, id, false);
  }

  @Post(':id/activate')
  @Contract({ output: carrierDtoSchema, roles: EDITORS })
  activate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, carriers, id, true);
  }
}

@Controller('trailers')
export class TrailersController extends CatalogController {
  protected readonly entity = 'trailer' as const;

  @Get()
  @Contract({ output: z.array(trailerDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadCatalog(tx, 'trailer'));
  }

  protected override unique(constraint: string | undefined) {
    return constraint === 'trailers_plate_unique' ? duplicatePlate('un remolque', 'esa') : super.unique(constraint);
  }

  @Post()
  @HttpCode(201)
  @Contract({ input: trailerSchema, output: trailerDtoSchema, errors: ['DUPLICATE_PLATE'], roles: EDITORS })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(trailerSchema)) input: z.output<typeof trailerSchema>,
  ) {
    await this.write(
      req,
      res,
      'trailer.create',
      null,
      async (tx) => {
        await this.activeCarrier(tx, input.carrierId);
        await this.uniquePlate(tx, input.plate);
        const [r] = await tx
          .insert(trailers)
          .values({ ...input, ...now(this.clock) })
          .returning({ id: trailers.id });
        return { id: r!.id };
      },
      201,
    );
  }

  @Patch(':id')
  @Contract({
    input: editTrailerSchema,
    output: trailerDtoSchema,
    errors: ['DUPLICATE_PLATE', 'STALE_RECORD'],
    roles: EDITORS,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editTrailerSchema)) input: z.output<typeof editTrailerSchema>,
  ) {
    const { expectedVersion, ...values } = input;
    await this.write(req, res, 'trailer.edit', id, async (tx) => {
      const before = await loadOne<z.infer<typeof trailerDtoSchema>>(tx, 'trailer', id);
      if (values.carrierId !== before.carrierId) {
        await this.activeCarrier(tx, values.carrierId);
        // RF-CAT-04: los remolques habituales de un camión son de su mismo transportista.
        const users = await tx
          .select({ plate: trucks.plate })
          .from(truckDefaultTrailers)
          .innerJoin(trucks, eq(trucks.id, truckDefaultTrailers.truckId))
          .where(and(eq(truckDefaultTrailers.trailerId, id), ne(trucks.carrierId, values.carrierId)));
        if (users.length > 0)
          throw invalid(
            'carrierId',
            `Es remolque habitual de camiones de su transportista (${users.map((u) => u.plate).join(', ')}): quítelo de ellos antes.`,
          );
      }
      await this.uniquePlate(tx, values.plate, id);
      await updateVersioned(tx, trailers, id, expectedVersion, { ...values, updatedAt: this.clock.now() });
      return { id, before };
    });
  }

  @Post(':id/deactivate')
  @Contract({ output: trailerDtoSchema, roles: EDITORS })
  deactivate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, trailers as never, id, false);
  }

  @Post(':id/activate')
  @Contract({ output: trailerDtoSchema, roles: EDITORS })
  activate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, trailers as never, id, true);
  }

  private async uniquePlate(tx: Tx, plate: string, selfId?: string) {
    const [same] = await tx
      .select({ id: trailers.id })
      .from(trailers)
      .where(and(eq(trailers.plate, plate), selfId ? ne(trailers.id, selfId) : undefined));
    if (same) throw duplicatePlate('un remolque', plate);
  }
}

@Controller('trucks')
export class TrucksController extends CatalogController {
  protected readonly entity = 'truck' as const;

  @Get()
  @Contract({ output: z.array(truckDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadCatalog(tx, 'truck'));
  }

  protected override unique(constraint: string | undefined) {
    return constraint === 'trucks_plate_unique' ? duplicatePlate('un camión', 'esa') : super.unique(constraint);
  }

  @Post()
  @HttpCode(201)
  @Contract({ input: truckSchema, output: truckDtoSchema, errors: ['DUPLICATE_PLATE'], roles: EDITORS })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(truckSchema)) input: z.output<typeof truckSchema>,
  ) {
    const { trailerIds, ...values } = input;
    await this.write(
      req,
      res,
      'truck.create',
      null,
      async (tx) => {
        await this.check(tx, values.carrierId, values.plate, trailerIds);
        const [t] = await tx
          .insert(trucks)
          .values({ ...values, ...now(this.clock) })
          .returning({ id: trucks.id });
        await this.saveTrailers(tx, t!.id, trailerIds);
        return { id: t!.id };
      },
      201,
    );
  }

  @Patch(':id')
  @Contract({
    input: editTruckSchema,
    output: truckDtoSchema,
    errors: ['DUPLICATE_PLATE', 'STALE_RECORD'],
    roles: EDITORS,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editTruckSchema)) input: z.output<typeof editTruckSchema>,
  ) {
    const { trailerIds, expectedVersion, ...values } = input;
    await this.write(req, res, 'truck.edit', id, async (tx) => {
      const before = await loadOne(tx, 'truck', id);
      await this.check(tx, values.carrierId, values.plate, trailerIds, id);
      await updateVersioned(tx, trucks, id, expectedVersion, { ...values, updatedAt: this.clock.now() });
      await tx.delete(truckDefaultTrailers).where(eq(truckDefaultTrailers.truckId, id));
      await this.saveTrailers(tx, id, trailerIds);
      return { id, before };
    });
  }

  @Post(':id/deactivate')
  @Contract({ output: truckDtoSchema, roles: EDITORS })
  deactivate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, trucks as never, id, false);
  }

  @Post(':id/activate')
  @Contract({ output: truckDtoSchema, roles: EDITORS })
  activate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, trucks as never, id, true);
  }

  /** F-13: transportista activo, chapa única y remolques activos del mismo transportista. */
  private async check(tx: Tx, carrierId: string, plate: string, trailerIds: string[], selfId?: string) {
    await this.activeCarrier(tx, carrierId);
    const [same] = await tx
      .select({ id: trucks.id })
      .from(trucks)
      .where(and(eq(trucks.plate, plate), selfId ? ne(trucks.id, selfId) : undefined));
    if (same) throw duplicatePlate('un camión', plate);
    const found = await tx
      .select({ id: trailers.id, plate: trailers.plate, carrierId: trailers.carrierId, active: trailers.active })
      .from(trailers)
      .where(inArray(trailers.id, trailerIds));
    const problems = trailerIds.flatMap((tid) => {
      const r = found.find((f) => f.id === tid);
      if (!r) return ['Un remolque elegido no existe.'];
      if (r.carrierId !== carrierId) return [`El remolque ${r.plate} es de otro transportista.`];
      return r.active ? [] : [`El remolque ${r.plate} está inactivo.`];
    });
    if (problems.length > 0) throw invalid('trailerIds', problems.join(' '));
  }

  private saveTrailers(tx: Tx, truckId: string, trailerIds: string[]) {
    return tx
      .insert(truckDefaultTrailers)
      .values(trailerIds.map((trailerId, i) => ({ truckId, trailerId, position: i + 1 })));
  }
}

@Controller('drivers')
export class DriversController extends CatalogController {
  protected readonly entity = 'driver' as const;

  @Get()
  @Contract({ output: z.array(driverDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => loadCatalog(tx, 'driver'));
  }

  protected override unique(constraint: string | undefined) {
    if (constraint === 'drivers_national_id_unique') {
      const message = 'Ya existe un chofer con ese carné.';
      return new AppError('DUPLICATE_NATIONAL_ID', message, { fields: { nationalId: message } });
    }
    if (constraint === 'drivers_license_no_unique')
      return invalid('licenseNo', 'Ya existe un chofer con esa licencia.');
    return super.unique(constraint);
  }

  @Post()
  @HttpCode(201)
  @Contract({ input: driverSchema, output: driverDtoSchema, errors: ['DUPLICATE_NATIONAL_ID'], roles: EDITORS })
  async create(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(driverSchema)) input: z.output<typeof driverSchema>,
  ) {
    await this.write(
      req,
      res,
      'driver.create',
      null,
      async (tx) => {
        await this.activeCarrier(tx, input.carrierId);
        await this.uniqueIds(tx, input.nationalId, input.licenseNo);
        const [d] = await tx
          .insert(drivers)
          .values({ ...input, ...now(this.clock) })
          .returning({ id: drivers.id });
        return { id: d!.id };
      },
      201,
    );
  }

  /** El transportista no cambia aquí: pide motivo (RF-CAT-09). */
  @Patch(':id')
  @Contract({
    input: editDriverSchema,
    output: driverDtoSchema,
    errors: ['DUPLICATE_NATIONAL_ID', 'STALE_RECORD'],
    roles: EDITORS,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editDriverSchema)) input: z.output<typeof editDriverSchema>,
  ) {
    const { expectedVersion, ...values } = input;
    await this.write(req, res, 'driver.edit', id, async (tx) => {
      const before = await loadOne(tx, 'driver', id);
      await this.uniqueIds(tx, values.nationalId, values.licenseNo, id);
      await updateVersioned(tx, drivers, id, expectedVersion, { ...values, updatedAt: this.clock.now() });
      return { id, before };
    });
  }

  /** RF-CAT-09: con motivo, en la bitácora; las órdenes ya emitidas conservan sus datos (guardan los suyos). */
  @Post(':id/carrier')
  @Contract({ input: changeDriverCarrierSchema, output: driverDtoSchema, errors: ['STALE_RECORD'], roles: EDITORS })
  async changeCarrier(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeDriverCarrierSchema)) input: z.output<typeof changeDriverCarrierSchema>,
  ) {
    const entry = {
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
      deviceId: req.auth.deviceId,
      action: 'driver.carrier',
      entityType: 'driver',
      entityId: id,
      reason: input.reason,
    };
    const result = await auditedWrite(this.db, this.clock, req, entry, async (tx) => {
      const before = await loadOne<z.infer<typeof driverDtoSchema>>(tx, 'driver', id);
      await this.activeCarrier(tx, input.carrierId);
      await updateVersioned(tx, drivers, id, input.expectedVersion, {
        carrierId: input.carrierId,
        updatedAt: this.clock.now(),
      });
      const after = await loadOne<z.infer<typeof driverDtoSchema>>(tx, 'driver', id);
      await replicate(tx, this.clock, [{ entity: 'driver', id }]);
      return {
        status: 200,
        body: after,
        entityId: id,
        before: { carrierId: before.carrierId },
        after: { carrierId: after.carrierId },
      };
    });
    res.status(result.status).json(result.body);
  }

  @Post(':id/deactivate')
  @Contract({ output: driverDtoSchema, roles: EDITORS })
  deactivate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, drivers as never, id, false);
  }

  @Post(':id/activate')
  @Contract({ output: driverDtoSchema, roles: EDITORS })
  activate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    return this.toggle(req, res, drivers as never, id, true);
  }

  /** RF-CAT-05: el carné (identificador del chofer) y la licencia no se repiten. */
  private async uniqueIds(tx: Tx, nationalId: string, licenseNo: string, selfId?: string) {
    const others = await tx
      .select({ nationalId: drivers.nationalId, licenseNo: drivers.licenseNo })
      .from(drivers)
      .where(
        and(
          selfId ? ne(drivers.id, selfId) : undefined,
          sql`(${drivers.nationalId} = ${nationalId} OR ${drivers.licenseNo} = ${licenseNo})`,
        ),
      );
    if (others.some((o) => o.nationalId === nationalId)) {
      const message = `Ya existe un chofer con el carné ${nationalId}.`;
      throw new AppError('DUPLICATE_NATIONAL_ID', message, { fields: { nationalId: message } });
    }
    if (others.length > 0) throw invalid('licenseNo', `Ya existe un chofer con la licencia ${licenseNo}.`);
  }
}

export const CATALOG_CONTROLLERS = [
  ClientsController,
  CarriersController,
  TrailersController,
  TrucksController,
  DriversController,
];
