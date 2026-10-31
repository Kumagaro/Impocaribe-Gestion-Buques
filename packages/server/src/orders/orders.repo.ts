// T075, T076 y T079 · plan §4.2 y §4.4: el DTO de las órdenes (con todas sus versiones) y de los borradores, el
// mismo para la respuesta, el cambio que se replica y la instantánea.
import { AppError, type Clock } from '@impocaribe/shared';
import type { DraftDto, DraftPayload, OrderDto, OrderSnapshot, OrderVersionDto } from '@impocaribe/shared/validation';
import { and, asc, eq, getTableColumns, gt, inArray, isNull, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import type { Tx } from '../audit/audit-log.ts';
import { drafts, loadOrders, loadOrderVersions, loadOrderVersionTrailers } from '../db/schema/orders.ts';
import { users } from '../db/schema/users.ts';
import { recordChanges, type Change } from '../sync/change-log.ts';
import { loadDeclarations, loadVessels } from '../vessels/vessels.repo.ts';

export interface Filter {
  ids?: string[];
  after?: string | null;
  limit?: number;
}

function where(column: PgColumn, f: Filter): SQL | undefined {
  return and(f.ids ? inArray(column, f.ids) : undefined, f.after ? gt(column, f.after) : undefined);
}

export async function readOrders(tx: Tx, f: Filter = {}): Promise<OrderDto[]> {
  const orders = await tx
    .select()
    .from(loadOrders)
    .where(where(loadOrders.id, f))
    .orderBy(asc(loadOrders.id))
    .limit(f.limit ?? 100_000);
  if (orders.length === 0) return [];
  const versions = await tx
    .select({ v: loadOrderVersions, issuedByName: users.fullName })
    .from(loadOrderVersions)
    .leftJoin(users, eq(users.id, loadOrderVersions.issuedBy))
    .where(
      inArray(
        loadOrderVersions.orderId,
        orders.map((o) => o.id),
      ),
    )
    .orderBy(asc(loadOrderVersions.versionNo));
  const trailerRows = await tx
    .select()
    .from(loadOrderVersionTrailers)
    .where(
      inArray(
        loadOrderVersionTrailers.versionId,
        versions.map((x) => x.v.id),
      ),
    )
    .orderBy(asc(loadOrderVersionTrailers.position));
  const dto = ({ v, issuedByName }: (typeof versions)[number]): OrderVersionDto => ({
    versionNo: v.versionNo,
    status: v.status,
    tons: v.tons,
    loadingDate: v.loadingDate,
    waybillNo: v.waybillNo,
    lotNo: v.lotNo,
    routeSheetNo: v.routeSheetNo,
    container: v.container,
    recipientId: v.recipientId,
    truckId: v.truckId,
    driverId: v.driverId,
    trailerIds: trailerRows.filter((r) => r.versionId === v.id).map((r) => r.trailerId),
    issuedAt: v.issuedAt.toISOString(),
    issuedById: v.issuedBy,
    issuedByName,
    reason: v.reason,
    capacityOverrideReason: v.capacityOverrideReason,
    sameDayOverrideReason: v.sameDayOverrideReason,
    snapshot: v.snapshot as OrderSnapshot,
  });
  return orders.map((o) => {
    const own = versions.filter((x) => x.v.orderId === o.id);
    const current = own.find((x) => x.v.id === o.currentVersionId)!;
    return {
      id: o.id,
      number: o.number,
      seq: o.seq,
      vesselId: o.vesselId,
      declarationId: o.declarationId,
      allocationId: o.allocationId,
      status: o.status,
      current: dto(current),
      firstIssuedAt: own[0]!.v.issuedAt.toISOString(),
      versions: own.map(dto),
    };
  });
}

export async function readOrder(tx: Tx, id: string): Promise<OrderDto> {
  const [o] = await readOrders(tx, { ids: [id] });
  if (!o) throw new AppError('NOT_FOUND', 'La orden no existe.');
  return o;
}

const lockers = alias(users, 'lockers');
const owners = alias(users, 'owners');

/** Los borradores vigentes (ni descartados ni emitidos). */
export async function readDrafts(
  tx: Tx,
  f: Filter & { includeClosed?: boolean; visibility?: 'private' | 'shared'; ownerId?: string } = {},
): Promise<DraftDto[]> {
  const rows = await tx
    .select({ ...getTableColumns(drafts), ownerName: owners.fullName, lockedByName: lockers.fullName })
    .from(drafts)
    .innerJoin(owners, eq(owners.id, drafts.ownerId))
    .leftJoin(lockers, eq(lockers.id, drafts.lockedBy))
    .where(
      and(
        where(drafts.id, f),
        f.visibility ? eq(drafts.visibility, f.visibility) : undefined,
        f.ownerId ? eq(drafts.ownerId, f.ownerId) : undefined,
        f.includeClosed ? undefined : isNull(drafts.discardedAt),
        f.includeClosed ? undefined : isNull(drafts.issuedOrderId),
      ),
    )
    .orderBy(asc(drafts.id))
    .limit(f.limit ?? 100_000);
  return rows.map(({ ownerName, lockedByName, ...d }) => ({
    id: d.id,
    clientDraftId: d.clientDraftId,
    ownerId: d.ownerId,
    ownerName,
    visibility: d.visibility,
    payload: d.payload as DraftPayload,
    lockedById: d.lockedBy,
    lockedByName,
    lockExpiresAt: d.lockExpiresAt?.toISOString() ?? null,
    updatedAt: d.updatedAt.toISOString(),
    issuedOrderId: d.issuedOrderId,
  }));
}

/** Quién ve un borrador: el autor si es privado; Apoderadas y Operadores si es compartido (ACLARAR-16). */
export const draftAudience = (d: { visibility: 'private' | 'shared'; ownerId: string }) =>
  d.visibility === 'shared' ? 'editors' : `user:${d.ownerId}`;

/**
 * Plan §4.4: replica las órdenes, los borradores y los buques y DM cuyos saldos cambiaron. Un borrador descartado o
 * emitido se borra de las copias. Último paso antes de confirmar.
 */
export async function replicateOrders(
  tx: Tx,
  clock: Clock,
  touched: { orders?: string[]; drafts?: string[]; vessels?: string[]; declarations?: string[] },
) {
  const changes: Change[] = [];
  for (const o of await readOrders(tx, { ids: [...new Set(touched.orders ?? [])] }))
    changes.push({
      entityType: 'order',
      entityId: o.id,
      op: 'upsert',
      audience: 'all',
      payload: o,
      refDate: o.current.loadingDate,
    });
  const draftIds = [...new Set(touched.drafts ?? [])];
  const open = await readDrafts(tx, { ids: draftIds });
  const all = draftIds.length ? await tx.select().from(drafts).where(inArray(drafts.id, draftIds)) : [];
  for (const d of all) {
    const dto = open.find((x) => x.id === d.id);
    // Un borrador que cambia de privado a compartido se borra de la copia del autor y llega a todos los editores.
    if (dto && d.visibility === 'shared')
      changes.push({
        entityType: 'draft',
        entityId: d.id,
        op: 'delete',
        audience: `user:${d.ownerId}`,
        payload: { id: d.id },
      });
    changes.push(
      dto
        ? { entityType: 'draft', entityId: d.id, op: 'upsert', audience: draftAudience(d), payload: dto }
        : { entityType: 'draft', entityId: d.id, op: 'delete', audience: draftAudience(d), payload: { id: d.id } },
    );
  }
  for (const v of await loadVessels(tx, { ids: [...new Set(touched.vessels ?? [])] }))
    changes.push({ entityType: 'vessel', entityId: v.id, op: 'upsert', audience: 'all', payload: v });
  for (const d of await loadDeclarations(tx, { ids: [...new Set(touched.declarations ?? [])] }))
    changes.push({
      entityType: 'declaration',
      entityId: d.id,
      op: 'upsert',
      audience: 'all',
      payload: d,
      refDate: d.deadlineStartDate,
    });
  return recordChanges(tx, clock, changes);
}
