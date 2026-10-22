// T079 a T082 · plan §5.1, §5.3 y §5.4: lo que necesitan emitir, corregir y anular, leído (y bloqueado, en el orden
// de DT-09: buque, DM, asignación, orden) dentro de la transacción. Con eso se valida (`checkOrder`), se arma el
// documento congelado de la versión y se genera su PDF.
import {
  addTons,
  AppError,
  deadlineAt,
  havanaDate,
  parseTons,
  subTons,
  type Clock,
  type OrderCheckInput,
  type OrderProblem,
} from '@impocaribe/shared';
import type { OrderSnapshot } from '@impocaribe/shared/validation';
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Tx } from '../audit/audit-log.ts';
import { carriers, clients, drivers, recipients, trailers, trucks } from '../db/schema/catalogs.ts';
import { officialSignatures, officialStamps, systemSettings } from '../db/schema/company.ts';
import { loadOrders, loadOrderVersions } from '../db/schema/orders.ts';
import {
  allocationChanges,
  allocations,
  customsDeclarations,
  customsDeclarationVersions,
  vAllocationBalance,
  vessels,
} from '../db/schema/vessels.ts';
import { readStoredFile } from '../files/files.ts';
import { statusNow } from '../vessels/allocate.ts';
import { loadDeclaration } from '../vessels/vessels.repo.ts';
import type { DocumentImages } from './pdf-template.ts';

export const PRODUCT = 'Harina de trigo';

/** Los campos de la orden (F-14), ya validados por su esquema. */
export interface OrderFields {
  recipientId: string;
  truckId: string;
  trailerIds: string[];
  driverId: string;
  tons: string;
  waybillNo: string;
  loadingDate: string;
  lotNo?: string | null | undefined;
  routeSheetNo?: string | null | undefined;
  container?: string | null | undefined;
  overrides?: { capacity?: string | undefined; sameDay?: string | undefined } | undefined;
}

const invalid = (field: string, message: string) =>
  new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', { fields: { [field]: message } });

/** El primer problema como error, con todos en los detalles y cada uno en su campo. */
export function problemsError(problems: OrderProblem[]): AppError {
  const first = problems[0]!;
  const fields: Record<string, string> = {};
  for (const p of problems) if (p.field) fields[p.field] ??= p.message;
  return new AppError(first.code, first.message, { ...first.details, fields, problems });
}

/**
 * Lee lo que la orden toca. Con `lock`, bloquea en el orden de DT-09 (buque, DM, asignación y, si es una corrección,
 * la orden). `orderId`: la orden que se corrige (no cuenta para el camión repetido).
 */
export async function gather(
  tx: Tx,
  clock: Clock,
  ref: { declarationId: string; allocationId: string; orderId?: string },
  f: OrderFields,
  lock: boolean,
) {
  const [alloc] = await tx.select().from(allocations).where(eq(allocations.id, ref.allocationId));
  if (!alloc || alloc.declarationId !== ref.declarationId) {
    // Una DM sin total no tiene buques (D11): se dice eso, que es la causa, y no «elija un buque».
    const [d] = await tx
      .select({ number: customsDeclarations.number, total: customsDeclarationVersions.totalTons })
      .from(customsDeclarations)
      .innerJoin(customsDeclarationVersions, eq(customsDeclarationVersions.id, customsDeclarations.currentVersionId))
      .where(eq(customsDeclarations.id, ref.declarationId));
    if (!d) throw invalid('declarationId', 'Elija una DM de la lista.');
    if (d.total === null)
      throw new AppError('DECLARATION_PENDING_TOTAL', `La DM ${d.number} no tiene total: no admite órdenes.`, {
        fields: { declarationId: `La DM ${d.number} no tiene total: no admite órdenes.` },
      });
    throw invalid('allocationId', 'Elija un buque asignado a esta DM.');
  }
  // DT-09: buque, DM, asignación y, si es una corrección, la orden.
  const vesselQ = tx.select().from(vessels).where(eq(vessels.id, alloc.vesselId));
  const [vessel] = lock ? await vesselQ.for('update') : await vesselQ;
  const declarationQ = tx.select().from(customsDeclarations).where(eq(customsDeclarations.id, ref.declarationId));
  const [declarationRow] = lock ? await declarationQ.for('update') : await declarationQ;
  if (lock) {
    await tx.select({ id: allocations.id }).from(allocations).where(eq(allocations.id, alloc.id)).for('update');
    if (ref.orderId)
      await tx.select({ id: loadOrders.id }).from(loadOrders).where(eq(loadOrders.id, ref.orderId)).for('update');
  }
  if (!vessel || !declarationRow) throw new AppError('NOT_FOUND', 'El buque o la DM no existen.');
  const declaration = await loadDeclaration(tx, ref.declarationId);
  const [dmVersion] = await tx
    .select()
    .from(customsDeclarationVersions)
    .where(eq(customsDeclarationVersions.id, declarationRow.currentVersionId!));
  const [client] = await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, declarationRow.clientId));
  const [balance] = await tx.select().from(vAllocationBalance).where(eq(vAllocationBalance.allocationId, alloc.id));

  const [recipient] = await tx.select().from(recipients).where(eq(recipients.id, f.recipientId));
  if (!recipient || recipient.clientId !== declarationRow.clientId)
    throw invalid('recipientId', 'Elija un destinatario del cliente de la DM.');
  const [truck] = await tx
    .select({ t: trucks, carrierName: carriers.name, carrierActive: carriers.active })
    .from(trucks)
    .innerJoin(carriers, eq(carriers.id, trucks.carrierId))
    .where(eq(trucks.id, f.truckId));
  if (!truck) throw invalid('truckId', 'Elija el camión.');
  const [driver] = await tx.select().from(drivers).where(eq(drivers.id, f.driverId));
  if (!driver) throw invalid('driverId', 'Elija el chofer.');
  const trailerRows = await tx.select().from(trailers).where(inArray(trailers.id, f.trailerIds));
  const ordered = f.trailerIds.map((id) => trailerRows.find((r) => r.id === id));
  if (ordered.some((r) => !r)) throw invalid('trailerIds', 'Elija los remolques de la lista.');

  const [settings] = await tx.select().from(systemSettings);
  const [signature] = await tx.select().from(officialSignatures).orderBy(desc(officialSignatures.createdAt)).limit(1);
  const [stamp] = await tx.select().from(officialStamps).orderBy(desc(officialStamps.createdAt)).limit(1);

  // D5 y ADV-07: otras órdenes oficiales vigentes del camión y del chofer con esa fecha de carga.
  const sameDay = (column: typeof loadOrderVersions.truckId | typeof loadOrderVersions.driverId, id: string) =>
    tx
      .select({ n: count() })
      .from(loadOrderVersions)
      .innerJoin(loadOrders, eq(loadOrders.currentVersionId, loadOrderVersions.id))
      .where(
        and(
          eq(column, id),
          eq(loadOrderVersions.loadingDate, f.loadingDate),
          eq(loadOrderVersions.status, 'official'),
          ref.orderId ? ne(loadOrders.id, ref.orderId) : undefined,
        ),
      )
      .then(([r]) => r?.n ?? 0);

  const today = havanaDate(clock.now());
  const sameDayOrders = await sameDay(loadOrderVersions.truckId, f.truckId);
  const status = statusNow(declaration, declarationRow, clock);
  return {
    today,
    vessel,
    declarationRow,
    declaration,
    dmVersion: dmVersion!,
    clientName: client!.name,
    allocation: alloc,
    balance: parseTons(balance!.balanceTons),
    recipient,
    truck: truck.t,
    carrierName: truck.carrierName,
    driver,
    trailers: ordered.map((r) => r!),
    signature: signature ?? null,
    stamp: stamp ?? null,
    expired: declarationRow.expiredAt !== null || deadlineAt(declarationRow.deadlineStartDate, clock.now()).expired,
    driverOrdersThatDay: await sameDay(loadOrderVersions.driverId, f.driverId),
    check: (correction: OrderCheckInput['correction']): OrderCheckInput => ({
      correction,
      today,
      maxLoadingDaysAhead: settings!.maxLoadingDaysAhead,
      hasOfficialSeal: signature !== undefined && stamp !== undefined,
      declaration: { number: declaration.number, status },
      vessel: { name: vessel.name, status: vessel.status, arrivalDate: vessel.arrivalDate },
      allocationBalance: parseTons(balance!.balanceTons),
      tons: parseTons(f.tons),
      loadingDate: f.loadingDate,
      recipient: { name: recipient.name, active: recipient.active },
      truck: { plate: truck.t.plate, active: truck.t.active && truck.carrierActive, carrierId: truck.t.carrierId },
      driver: { fullName: driver.fullName, active: driver.active, carrierId: driver.carrierId },
      trailers: ordered.map((r) => ({
        plate: r!.plate,
        active: r!.active,
        carrierId: r!.carrierId,
        capacity: parseTons(r!.capacityTons),
      })),
      sameDayOrders,
      overrides: f.overrides ?? {},
    }),
  };
}

export type OrderContext = Awaited<ReturnType<typeof gather>>;

/** El documento congelado de una versión (RF-PDF-01): lo que se imprime, sin depender de cambios futuros. */
export function buildSnapshot(
  c: OrderContext,
  f: OrderFields,
  number: string,
  versionNo: number,
  signature: { representativeName: string; credentialNo: string; position: string },
): OrderSnapshot {
  return {
    number,
    issueDate: c.today,
    versionNo,
    internalBuyer: c.vessel.internalBuyer,
    port: c.vessel.port,
    loadingDate: f.loadingDate,
    product: PRODUCT,
    container: f.container ?? null,
    tons: f.tons,
    vesselName: c.vessel.name,
    manifest: c.vessel.manifest,
    bl: c.vessel.bl,
    declarationNumber: c.declaration.number,
    clientName: c.clientName,
    brand: c.dmVersion.brand,
    recipientName: c.recipient.name,
    recipientAddress: c.recipient.address,
    carrierName: c.carrierName,
    truckPlate: c.truck.plate,
    tractorPlate: c.truck.tractorPlate,
    trailerPlates: c.trailers.map((r) => r.plate),
    lotNo: f.lotNo ?? null,
    routeSheetNo: f.routeSheetNo ?? null,
    waybillNo: f.waybillNo,
    baseLocation: c.truck.baseLocation,
    driverName: c.driver.fullName,
    driverNationalId: c.driver.nationalId,
    driverLicenseNo: c.driver.licenseNo,
    representativeName: signature.representativeName,
    credentialNo: signature.credentialNo,
    position: signature.position,
  };
}

/** Las imágenes de la firma y el cuño aplicados a una versión (RF-EMP-03). */
export async function sealImages(
  tx: Tx,
  dataDir: string,
  signatureId: string,
  stampId: string,
): Promise<DocumentImages> {
  const [sig] = await tx.select().from(officialSignatures).where(eq(officialSignatures.id, signatureId));
  const [st] = await tx.select().from(officialStamps).where(eq(officialStamps.id, stampId));
  const a = await readStoredFile(tx, dataDir, sig!.fileId);
  const b = await readStoredFile(tx, dataDir, st!.fileId);
  return {
    signature: { mime: a.mime, base64: Buffer.from(a.bytes).toString('base64') },
    stamp: { mime: b.mime, base64: Buffer.from(b.bytes).toString('base64') },
  };
}

/**
 * RF-ORD-17, 19 y caso límite 4: si la DM está vencida, lo que una corrección o anulación devuelve no se queda en la
 * asignación: vuelve libre al buque (la asignación se reduce al nuevo cargado). Con el buque cerrado queda como
 * sobrante sin destino (RF-BUQ-09).
 */
export async function releaseIfExpired(tx: Tx, clock: Clock, c: OrderContext, reason: string, userId: string) {
  if (!c.expired) return;
  const [b] = await tx.select().from(vAllocationBalance).where(eq(vAllocationBalance.allocationId, c.allocation.id));
  if (parseTons(b!.allocatedTons).lessThanOrEqualTo(parseTons(b!.loadedTons))) return;
  await tx
    .update(allocations)
    .set({
      allocatedTons: b!.loadedTons,
      rowVersion: sql`${allocations.rowVersion} + 1`,
      updatedAt: clock.now(),
    })
    .where(eq(allocations.id, c.allocation.id));
  await tx.insert(allocationChanges).values({
    allocationId: c.allocation.id,
    previousTons: b!.allocatedTons,
    newTons: b!.loadedTons,
    kind: 'void_release',
    reason,
    createdBy: userId,
    createdAt: clock.now(),
  });
}

/** Saldo de la DM tras la orden (ADV-02): total − cargado − esta orden (+ lo que libera la versión vigente). */
export function declarationBalanceAfter(c: OrderContext, tons: string, released = '0') {
  const total = c.declaration.totalTons;
  return total === null
    ? null
    : subTons(
        subTons(parseTons(total), parseTons(c.declaration.loadedTons)),
        subTons(parseTons(tons), parseTons(released)),
      );
}

export const capacityOf = (c: OrderContext) => addTons(...c.trailers.map((r) => parseTons(r.capacityTons)));
