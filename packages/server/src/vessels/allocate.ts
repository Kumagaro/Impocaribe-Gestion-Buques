// T064 · RF-ASG-01 a 04, D2, D11, plan §5.5: asignar toneladas de un buque a una DM, dentro de la transacción del que
// llama y con el buque bloqueado antes que la DM (DT-09).
import {
  AppError,
  compareTons,
  deadlineAt,
  declarationStatus,
  formatTons,
  parseTons,
  subTons,
  tonsToApi,
  type Clock,
  type Tons,
} from '@impocaribe/shared';
import { exceedsVesselText, type DeclarationDto, type VesselDto } from '@impocaribe/shared/validation';
import { and, eq } from 'drizzle-orm';
import { raiseEvent } from '../alerts/alerts.ts';
import type { Tx } from '../audit/audit-log.ts';
import { allocationChanges, allocations, type customsDeclarations } from '../db/schema/vessels.ts';
import { loadDeclaration, loadVessel, lockDeclaration, lockVessels } from './vessels.repo.ts';

const ZERO = parseTons('0');
const tons = (s: string | null) => (s === null ? null : parseTons(s));

/** El estado de una DM ahora, con la hora del servidor (RF-DM-06, RF-PLZ-03). */
export function statusNow(d: DeclarationDto, row: typeof customsDeclarations.$inferSelect, clock: Clock) {
  return declarationStatus({
    total: tons(d.totalTons),
    allocations: d.allocations.map((a) => ({ allocated: parseTons(a.allocatedTons), loaded: parseTons(a.loadedTons) })),
    expired: row.expiredAt !== null || deadlineAt(row.deadlineStartDate, clock.now()).expired,
  });
}

/** RF-ASG-01: la DM admite asignaciones (y órdenes) solo si tiene total y no está vencida ni cerrada. */
export function assertDeclarationOpen(d: DeclarationDto, row: typeof customsDeclarations.$inferSelect, clock: Clock) {
  const status = statusNow(d, row, clock);
  if (status === 'pending_total')
    throw new AppError(
      'DECLARATION_PENDING_TOTAL',
      `La DM ${d.number} no tiene total: registre el total antes de asignarla a un buque.`,
    );
  if (status === 'expired')
    throw new AppError('DECLARATION_EXPIRED', `La DM ${d.number} está vencida: reactívela para asignarla.`);
  if (status === 'closed')
    throw new AppError('DECLARATION_CLOSED', `La DM ${d.number} está cerrada: ya se cargó todo su total.`);
}

export function assertVesselOpen(v: { status: string; name: string }) {
  if (v.status === 'closed')
    throw new AppError('VESSEL_CLOSED', `El buque ${v.name} está cerrado: no admite asignaciones ni órdenes nuevas.`);
}

export interface AllocateInput {
  declarationId: string;
  vesselId: string;
  tons: string;
  confirmPartial?: boolean | undefined;
  reason?: string | undefined;
  userId: string;
  /** El destino «Asignar a DM» del sobrante (RF-BUQ-08): nunca parcial. */
  surplus?: boolean;
}

export interface Allocated {
  allocationId: string;
  vessel: VesselDto;
  declaration: DeclarationDto;
  tons: Tons;
  partial: boolean;
}

/** Bloquea el buque y la DM (en ese orden) y asigna; si lo pedido supera lo libre, asigna lo libre solo si se confirma. */
export async function allocate(tx: Tx, clock: Clock, input: AllocateInput): Promise<Allocated> {
  const [vesselRow] = await lockVessels(tx, [input.vesselId]);
  const declarationRow = await lockDeclaration(tx, input.declarationId);
  const vessel = await loadVessel(tx, input.vesselId);
  const declaration = await loadDeclaration(tx, input.declarationId);
  assertVesselOpen(vesselRow!);
  assertDeclarationOpen(declaration, declarationRow, clock);

  const wanted = parseTons(input.tons);
  const pending = parseTons(declaration.pendingAllocationTons!);
  if (compareTons(wanted, pending) > 0)
    throw new AppError(
      'ALLOCATION_EXCEEDS_DECLARATION',
      `La DM ${declaration.number} solo tiene ${formatTons(pending)} pendientes de asignar.`,
      { pendingTons: tonsToApi(pending), fields: { tons: `Como máximo ${formatTons(pending)}.` } },
    );

  const free = parseTons(vessel.freeTons);
  let amount = wanted;
  if (compareTons(wanted, free) > 0) {
    const excess = subTons(wanted, free);
    if (input.surplus || !input.confirmPartial || compareTons(free, ZERO) <= 0)
      throw new AppError(
        'ALLOCATION_EXCEEDS_VESSEL',
        compareTons(free, ZERO) <= 0
          ? `El buque ${vessel.code} no tiene toneladas libres para asignar.`
          : exceedsVesselText(declaration.number, vessel.code, formatTons(excess)),
        { excessTons: tonsToApi(excess), freeTons: tonsToApi(free) },
      );
    amount = free;
  }

  const [existing] = await tx
    .select()
    .from(allocations)
    .where(and(eq(allocations.declarationId, input.declarationId), eq(allocations.vesselId, input.vesselId)));
  const previous = existing ? parseTons(existing.allocatedTons) : ZERO;
  const next = tonsToApi(previous.plus(amount) as Tons);
  const now = clock.now();
  const [row] = existing
    ? await tx
        .update(allocations)
        .set({ allocatedTons: next, rowVersion: existing.rowVersion + 1, updatedAt: now })
        .where(eq(allocations.id, existing.id))
        .returning({ id: allocations.id })
    : await tx
        .insert(allocations)
        .values({
          declarationId: input.declarationId,
          vesselId: input.vesselId,
          allocatedTons: next,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: allocations.id });
  const partial = compareTons(amount, wanted) < 0;
  await tx.insert(allocationChanges).values({
    allocationId: row!.id,
    previousTons: tonsToApi(previous),
    newTons: next,
    kind: input.surplus ? 'surplus_assign' : partial ? 'partial_assign' : 'assign',
    reason: input.reason ?? null,
    createdBy: input.userId,
    createdAt: now,
  });
  if (partial)
    await raiseEvent(tx, clock, {
      type: 'AL-10',
      title: `Asignación parcial de la DM ${declaration.number} en ${vessel.name}`,
      detail: `Se pidieron ${formatTons(wanted)} y el buque solo tenía ${formatTons(amount)} libres. Motivo: ${input.reason ?? 'sin motivo'}`,
      entity: { type: 'declaration', id: declaration.id },
    });
  return { allocationId: row!.id, vessel, declaration, tons: amount, partial };
}
