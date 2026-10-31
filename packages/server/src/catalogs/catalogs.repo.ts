// T055 y T056 · plan §4.2 y §4.4 (Catálogos): un lector de DTO por entidad, el mismo para la respuesta de la API, el
// cambio que se replica y la instantánea de la sincronización (que así nunca difieren).
import { AppError, type Clock } from '@impocaribe/shared';
import type { CarrierDto, ClientDto, DriverDto, SyncEntity, TrailerDto, TruckDto } from '@impocaribe/shared/validation';
import { and, asc, gt, inArray, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Tx } from '../audit/audit-log.ts';
import {
  carriers,
  clients,
  drivers,
  recipients,
  trailers,
  truckDefaultTrailers,
  trucks,
} from '../db/schema/catalogs.ts';
import { recordChanges } from '../sync/change-log.ts';

export type CatalogEntity = Extract<SyncEntity, 'client' | 'carrier' | 'truck' | 'trailer' | 'driver'>;
type Dto = ClientDto | CarrierDto | TruckDto | TrailerDto | DriverDto;

/** Qué filas leer: unas concretas, o una página ordenada por id (instantánea). */
export interface Filter {
  ids?: string[];
  after?: string | null;
  limit?: number;
}

function where(column: PgColumn, f: Filter): SQL | undefined {
  return and(f.ids ? inArray(column, f.ids) : undefined, f.after ? gt(column, f.after) : undefined);
}

const LOADERS: Record<CatalogEntity, (tx: Tx, f: Filter) => Promise<Dto[]>> = {
  async client(tx, f) {
    const rows = await tx
      .select({ id: clients.id, name: clients.name, active: clients.active, rowVersion: clients.rowVersion })
      .from(clients)
      .where(where(clients.id, f))
      .orderBy(asc(clients.id))
      .limit(f.limit ?? 100_000);
    if (rows.length === 0) return [];
    const all = await tx
      .select({
        id: recipients.id,
        clientId: recipients.clientId,
        name: recipients.name,
        address: recipients.address,
        active: recipients.active,
      })
      .from(recipients)
      .where(
        inArray(
          recipients.clientId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(recipients.position));
    return rows.map((c) => ({
      ...c,
      recipients: all
        .filter((r) => r.clientId === c.id)
        .map((r) => ({ id: r.id, name: r.name, address: r.address, active: r.active })),
    }));
  },
  carrier: (tx, f) =>
    tx
      .select({ id: carriers.id, name: carriers.name, active: carriers.active, rowVersion: carriers.rowVersion })
      .from(carriers)
      .where(where(carriers.id, f))
      .orderBy(asc(carriers.id))
      .limit(f.limit ?? 100_000),
  trailer: (tx, f) =>
    tx
      .select({
        id: trailers.id,
        plate: trailers.plate,
        capacityTons: trailers.capacityTons,
        carrierId: trailers.carrierId,
        active: trailers.active,
        rowVersion: trailers.rowVersion,
      })
      .from(trailers)
      .where(where(trailers.id, f))
      .orderBy(asc(trailers.id))
      .limit(f.limit ?? 100_000),
  async truck(tx, f) {
    const rows = await tx
      .select({
        id: trucks.id,
        plate: trucks.plate,
        tractorPlate: trucks.tractorPlate,
        baseLocation: trucks.baseLocation,
        carrierId: trucks.carrierId,
        active: trucks.active,
        rowVersion: trucks.rowVersion,
      })
      .from(trucks)
      .where(where(trucks.id, f))
      .orderBy(asc(trucks.id))
      .limit(f.limit ?? 100_000);
    if (rows.length === 0) return [];
    const links = await tx
      .select({ truckId: truckDefaultTrailers.truckId, trailerId: truckDefaultTrailers.trailerId })
      .from(truckDefaultTrailers)
      .where(
        inArray(
          truckDefaultTrailers.truckId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(truckDefaultTrailers.position));
    return rows.map((t) => ({
      ...t,
      trailerIds: links.filter((l) => l.truckId === t.id).map((l) => l.trailerId),
    }));
  },
  driver: (tx, f) =>
    tx
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        nationalId: drivers.nationalId,
        licenseNo: drivers.licenseNo,
        carrierId: drivers.carrierId,
        active: drivers.active,
        rowVersion: drivers.rowVersion,
      })
      .from(drivers)
      .where(where(drivers.id, f))
      .orderBy(asc(drivers.id))
      .limit(f.limit ?? 100_000),
};

export function loadCatalog(tx: Tx, entity: CatalogEntity, f: Filter = {}): Promise<Dto[]> {
  return LOADERS[entity](tx, f);
}

export async function loadOne<T extends Dto>(tx: Tx, entity: CatalogEntity, id: string): Promise<T> {
  const [dto] = await LOADERS[entity](tx, { ids: [id] });
  if (!dto) throw new AppError('NOT_FOUND', 'El registro no existe.');
  return dto as T;
}

/** Plan §4.4: el DTO completo, para todos. Último paso antes de confirmar (recordChanges). */
export async function replicate(tx: Tx, clock: Clock, items: { entity: CatalogEntity; id: string }[]) {
  const changes = [];
  for (const { entity, id } of items)
    changes.push({
      entityType: entity,
      entityId: id,
      op: 'upsert' as const,
      audience: 'all',
      payload: await loadOne(tx, entity, id),
    });
  return recordChanges(tx, clock, changes);
}

/** Las fuentes de la instantánea (sync.controller), con el mismo DTO. */
export const CATALOG_ENTITIES: CatalogEntity[] = ['carrier', 'trailer', 'truck', 'driver', 'client'];
