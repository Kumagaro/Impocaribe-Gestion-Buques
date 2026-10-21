// T065 y T066 · plan §4.3, §4.4 y DT-09: el DTO de buques y DM con sus saldos (de las vistas, nunca guardados), el
// mismo para la respuesta, el cambio que se replica y la instantánea; y los bloqueos en el orden global.
import { AppError, type Clock } from '@impocaribe/shared';
import type { DeclarationDto, VesselDto } from '@impocaribe/shared/validation';
import { and, asc, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Tx } from '../audit/audit-log.ts';
import {
  allocations,
  customsDeclarations,
  customsDeclarationVersions,
  vAllocationBalance,
  vDeclarationBalance,
  vessels,
  vVesselBalance,
} from '../db/schema/vessels.ts';
import { recordChanges } from '../sync/change-log.ts';

export interface Filter {
  ids?: string[];
  after?: string | null;
  limit?: number;
}

function where(column: PgColumn, f: Filter): SQL | undefined {
  return and(f.ids ? inArray(column, f.ids) : undefined, f.after ? gt(column, f.after) : undefined);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function loadVessels(tx: Tx, f: Filter = {}): Promise<VesselDto[]> {
  const rows = await tx
    .select({
      id: vessels.id,
      name: vessels.name,
      code: vessels.code,
      manifest: vessels.manifest,
      bl: vessels.bl,
      port: vessels.port,
      internalBuyer: vessels.internalBuyer,
      etaDate: vessels.etaDate,
      arrivalDate: vessels.arrivalDate,
      voyageNo: vessels.voyageNo,
      totalTons: vessels.totalTons,
      allocatedTons: vVesselBalance.allocatedTons,
      loadedTons: vVesselBalance.loadedTons,
      freeTons: vVesselBalance.freeTons,
      remainingTons: vVesselBalance.remainingTons,
      disposedOutTons: vVesselBalance.disposedOutTons,
      surplusTons: vVesselBalance.surplusTons,
      unresolvedSurplusTons: vVesselBalance.unresolvedSurplusTons,
      status: vessels.status,
      closedAt: vessels.closedAt,
      lastOrderSeq: vessels.lastOrderSeq,
      rowVersion: vessels.rowVersion,
    })
    .from(vessels)
    .innerJoin(vVesselBalance, eq(vVesselBalance.vesselId, vessels.id))
    .where(where(vessels.id, f))
    .orderBy(asc(vessels.id))
    .limit(f.limit ?? 100_000);
  return rows.map(({ lastOrderSeq, ...v }) => ({ ...v, closedAt: iso(v.closedAt), hasOrders: lastOrderSeq > 0 }));
}

export async function loadDeclarations(tx: Tx, f: Filter = {}): Promise<DeclarationDto[]> {
  const rows = await tx
    .select({
      id: customsDeclarations.id,
      number: customsDeclarations.number,
      clientId: customsDeclarations.clientId,
      brand: customsDeclarationVersions.brand,
      totalTons: customsDeclarationVersions.totalTons,
      declarationDate: customsDeclarations.declarationDate,
      deadlineStartDate: customsDeclarations.deadlineStartDate,
      expiredAt: customsDeclarations.expiredAt,
      versionNo: customsDeclarationVersions.versionNo,
      allocatedTons: vDeclarationBalance.allocatedTons,
      loadedTons: vDeclarationBalance.loadedTons,
      balanceTons: vDeclarationBalance.balanceTons,
      pendingAllocationTons: vDeclarationBalance.pendingAllocationTons,
      rowVersion: customsDeclarations.rowVersion,
    })
    .from(customsDeclarations)
    .innerJoin(customsDeclarationVersions, eq(customsDeclarationVersions.id, customsDeclarations.currentVersionId))
    .innerJoin(vDeclarationBalance, eq(vDeclarationBalance.declarationId, customsDeclarations.id))
    .where(where(customsDeclarations.id, f))
    .orderBy(asc(customsDeclarations.id))
    .limit(f.limit ?? 100_000);
  if (rows.length === 0) return [];
  const all = await tx
    .select({
      id: allocations.id,
      declarationId: allocations.declarationId,
      vesselId: allocations.vesselId,
      allocatedTons: vAllocationBalance.allocatedTons,
      loadedTons: vAllocationBalance.loadedTons,
      balanceTons: vAllocationBalance.balanceTons,
      rowVersion: allocations.rowVersion,
    })
    .from(allocations)
    .innerJoin(vAllocationBalance, eq(vAllocationBalance.allocationId, allocations.id))
    .where(
      inArray(
        allocations.declarationId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(allocations.createdAt));
  return rows.map((d) => ({
    ...d,
    expiredAt: iso(d.expiredAt),
    allocations: all
      .filter((a) => a.declarationId === d.id)
      .map((a) => ({
        id: a.id,
        vesselId: a.vesselId,
        allocatedTons: a.allocatedTons,
        loadedTons: a.loadedTons,
        balanceTons: a.balanceTons,
        rowVersion: a.rowVersion,
      })),
  }));
}

export async function loadVessel(tx: Tx, id: string): Promise<VesselDto> {
  const [v] = await loadVessels(tx, { ids: [id] });
  if (!v) throw new AppError('NOT_FOUND', 'El buque no existe.');
  return v;
}

export async function loadDeclaration(tx: Tx, id: string): Promise<DeclarationDto> {
  const [d] = await loadDeclarations(tx, { ids: [id] });
  if (!d) throw new AppError('NOT_FOUND', 'La DM no existe.');
  return d;
}

/** DT-09: buques (por id) antes que DM (por id). Devuelve las filas bloqueadas. */
export async function lockVessels(tx: Tx, ids: string[]) {
  if (ids.length === 0) return [];
  const sorted = [...new Set(ids)].sort();
  const rows = await tx
    .select()
    .from(vessels)
    .where(inArray(vessels.id, sorted))
    .orderBy(asc(vessels.id))
    .for('update');
  if (rows.length !== sorted.length) throw new AppError('NOT_FOUND', 'El buque no existe.');
  return rows;
}

export async function lockDeclaration(tx: Tx, id: string) {
  const [row] = await tx.select().from(customsDeclarations).where(eq(customsDeclarations.id, id)).for('update');
  if (!row) throw new AppError('NOT_FOUND', 'La DM no existe.');
  return row;
}

/** Los buques de las asignaciones de una DM (sin bloquear: para bloquearlos antes que la DM, DT-09). */
export async function vesselsOfDeclaration(tx: Tx, declarationId: string): Promise<string[]> {
  const rows = await tx
    .select({ vesselId: allocations.vesselId })
    .from(allocations)
    .where(eq(allocations.declarationId, declarationId));
  return rows.map((r) => r.vesselId);
}

/** Plan §4.4: replica el DTO completo de cada buque y DM tocados, para todos. Último paso antes de confirmar. */
export async function replicate(tx: Tx, clock: Clock, touched: { vessels?: string[]; declarations?: string[] }) {
  const vs = await loadVessels(tx, { ids: [...new Set(touched.vessels ?? [])] });
  const ds = await loadDeclarations(tx, { ids: [...new Set(touched.declarations ?? [])] });
  return recordChanges(tx, clock, [
    ...vs.map((v) => ({
      entityType: 'vessel',
      entityId: v.id,
      op: 'upsert' as const,
      audience: 'all',
      payload: v,
      ...((v.arrivalDate ?? v.etaDate) ? { refDate: (v.arrivalDate ?? v.etaDate)! } : {}),
    })),
    ...ds.map((d) => ({
      entityType: 'declaration',
      entityId: d.id,
      op: 'upsert' as const,
      audience: 'all',
      payload: d,
      refDate: d.deadlineStartDate,
    })),
  ]);
}

/** El total de la versión vigente de una DM bloqueada (null: pendiente de total). */
export async function currentVersion(tx: Tx, versionId: string) {
  const [v] = await tx.select().from(customsDeclarationVersions).where(eq(customsDeclarationVersions.id, versionId));
  return v!;
}

/** La siguiente versión de una DM: se inserta y pasa a ser la vigente (Const. art. III). */
export async function addVersion(
  tx: Tx,
  clock: Clock,
  declarationId: string,
  values: Pick<typeof customsDeclarationVersions.$inferInsert, 'brand' | 'totalTons' | 'kind' | 'reason' | 'createdBy'>,
  extra: Partial<typeof customsDeclarations.$inferInsert> = {},
) {
  const [{ next }] = (await tx
    .select({ next: sql<number>`coalesce(max(${customsDeclarationVersions.versionNo}), 0) + 1` })
    .from(customsDeclarationVersions)
    .where(eq(customsDeclarationVersions.declarationId, declarationId))) as [{ next: number }];
  const [v] = await tx
    .insert(customsDeclarationVersions)
    .values({ ...values, declarationId, versionNo: next, createdAt: clock.now() })
    .returning({ id: customsDeclarationVersions.id });
  await tx
    .update(customsDeclarations)
    .set({ currentVersionId: v!.id, rowVersion: sql`${customsDeclarations.rowVersion} + 1`, ...extra })
    .where(eq(customsDeclarations.id, declarationId));
}
