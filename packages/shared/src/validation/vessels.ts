// T066 · plan §4.2, §4.3 y §6.2: los DTO de buques, DM y asignaciones que publica el servidor y guarda la copia local.
// Los saldos llegan calculados (Const. art. VII); el estado y el día del plazo los calcula `shared/domain` con la hora
// del servidor, porque cambian con el paso del tiempo. Las toneladas viajan como texto con 3 decimales.
import { z } from 'zod';
import { SURPLUS_KINDS } from './forms/F08.ts';

const tons = z.string();
const date = z.iso.date();

export const vesselDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  manifest: z.string(),
  bl: z.string(),
  port: z.string(),
  internalBuyer: z.string(),
  etaDate: date.nullable(),
  arrivalDate: date.nullable(),
  voyageNo: z.number().int().positive().nullable(),
  totalTons: tons,
  allocatedTons: tons,
  loadedTons: tons,
  freeTons: tons,
  remainingTons: tons,
  /** RF-BUQ-08: lo que salió del buque (transferido o merma). */
  disposedOutTons: tons,
  surplusTons: tons,
  unresolvedSurplusTons: tons,
  status: z.enum(['open', 'closed']),
  closedAt: z.iso.datetime().nullable(),
  /** RF-BUQ-07: con órdenes emitidas, la fecha real ya no cambia. */
  hasOrders: z.boolean(),
  rowVersion: z.number().int().positive(),
});
export type VesselDto = z.infer<typeof vesselDtoSchema>;

export const allocationDtoSchema = z.object({
  id: z.uuid(),
  vesselId: z.uuid(),
  allocatedTons: tons,
  loadedTons: tons,
  balanceTons: tons,
  rowVersion: z.number().int().positive(),
});
export type AllocationDto = z.infer<typeof allocationDtoSchema>;

export const declarationDtoSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  clientId: z.uuid(),
  brand: z.string(),
  /** null: pendiente de total. */
  totalTons: tons.nullable(),
  /** Fecha de creación, día 1 del primer plazo (RF-DM-01). */
  declarationDate: date,
  /** Día 1 del plazo vigente: la creación o la última reactivación (RF-PLZ-01). */
  deadlineStartDate: date,
  expiredAt: z.iso.datetime().nullable(),
  versionNo: z.number().int().positive(),
  allocatedTons: tons,
  loadedTons: tons,
  balanceTons: tons.nullable(),
  pendingAllocationTons: tons.nullable(),
  allocations: z.array(allocationDtoSchema),
  rowVersion: z.number().int().positive(),
});
export type DeclarationDto = z.infer<typeof declarationDtoSchema>;

/** RF-ASG-02: lo pedido supera lo libre del buque. */
export const allocationExceedsDetailsSchema = z.object({ excessTons: tons, freeTons: tons });

export const declarationVersionDtoSchema = z.object({
  versionNo: z.number().int().positive(),
  kind: z.enum(['create', 'edit', 'reactivate', 'expire']),
  brand: z.string(),
  totalTons: tons.nullable(),
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const allocationChangeDtoSchema = z.object({
  vesselId: z.uuid(),
  kind: z.enum(['assign', 'partial_assign', 'edit', 'expire_release', 'void_release', 'surplus_assign']),
  previousTons: tons,
  newTons: tons,
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** RF-BIT-04 y P-10: versiones de la DM y cambios de sus asignaciones. */
export const declarationHistorySchema = z.object({
  versions: z.array(declarationVersionDtoSchema),
  allocationChanges: z.array(allocationChangeDtoSchema),
});
export type DeclarationHistory = z.infer<typeof declarationHistorySchema>;

export const surplusDispositionDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(SURPLUS_KINDS),
  tons,
  /** Si es una transferencia que este buque recibió de otro. */
  incoming: z.boolean(),
  otherVesselId: z.uuid().nullable(),
  targetDeclarationId: z.uuid().nullable(),
  reason: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** RF-BUQ-08: el sobrante y sus destinos registrados. */
export const vesselSurplusSchema = z.object({
  surplusTons: tons,
  unresolvedTons: tons,
  dispositions: z.array(surplusDispositionDtoSchema),
});
export type VesselSurplus = z.infer<typeof vesselSurplusSchema>;

/** P-08, historial: lo que dice la bitácora del buque. */
export const vesselHistorySchema = z.array(
  z.object({
    action: z.string(),
    reason: z.string().nullable(),
    userName: z.string().nullable(),
    at: z.iso.datetime(),
  }),
);
export type VesselHistory = z.infer<typeof vesselHistorySchema>;
