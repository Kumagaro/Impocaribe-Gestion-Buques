// T075, T076 y T079 · plan §4.2 y §6.2 (Órdenes y Borradores): los DTO que publica el servidor y guarda la copia
// local, el documento congelado de cada versión y la respuesta de la comprobación previa. Toneladas como texto.
import { z } from 'zod';
import { draftPayloadSchema } from './forms/F14.ts';

const tons = z.string();
const date = z.iso.date();
const at = z.iso.datetime();

/** Lo que quedó impreso en el documento de una versión, congelado (Const. art. III). */
export const orderSnapshotSchema = z.object({
  number: z.string(),
  issueDate: date,
  versionNo: z.number().int().positive(),
  internalBuyer: z.string(),
  port: z.string(),
  loadingDate: date,
  product: z.string(),
  container: z.string().nullable(),
  tons,
  vesselName: z.string(),
  manifest: z.string(),
  bl: z.string(),
  declarationNumber: z.string(),
  clientName: z.string(),
  brand: z.string(),
  recipientName: z.string(),
  recipientAddress: z.string(),
  carrierName: z.string(),
  truckPlate: z.string(),
  tractorPlate: z.string().nullable(),
  trailerPlates: z.array(z.string()),
  lotNo: z.string().nullable(),
  routeSheetNo: z.string().nullable(),
  waybillNo: z.string(),
  baseLocation: z.string(),
  driverName: z.string(),
  driverNationalId: z.string(),
  driverLicenseNo: z.string(),
  representativeName: z.string(),
  credentialNo: z.string(),
  position: z.string(),
});
export type OrderSnapshot = z.infer<typeof orderSnapshotSchema>;

export const ORDER_VERSION_STATUSES = ['official', 'replaced', 'voided'] as const;

export const orderVersionDtoSchema = z.object({
  versionNo: z.number().int().positive(),
  status: z.enum(ORDER_VERSION_STATUSES),
  tons,
  loadingDate: date,
  waybillNo: z.string(),
  lotNo: z.string().nullable(),
  routeSheetNo: z.string().nullable(),
  container: z.string().nullable(),
  recipientId: z.uuid(),
  truckId: z.uuid(),
  driverId: z.uuid(),
  trailerIds: z.array(z.uuid()),
  issuedAt: at,
  issuedById: z.uuid().nullable(),
  issuedByName: z.string().nullable(),
  reason: z.string().nullable(),
  capacityOverrideReason: z.string().nullable(),
  sameDayOverrideReason: z.string().nullable(),
  /** Lo impreso en esta versión: la pantalla muestra el documento sin conexión (P-15). */
  snapshot: orderSnapshotSchema,
});
export type OrderVersionDto = z.infer<typeof orderVersionDtoSchema>;

/** La orden con su versión vigente y su historia (RF-ORD-02, 20). */
export const orderDtoSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  seq: z.number().int().positive(),
  vesselId: z.uuid(),
  declarationId: z.uuid(),
  allocationId: z.uuid(),
  /** Estado de la versión vigente. */
  status: z.enum(['official', 'voided']),
  current: orderVersionDtoSchema,
  /** Fecha de emisión de la versión 1 (límite de la fecha de carga al corregir). */
  firstIssuedAt: at,
  versions: z.array(orderVersionDtoSchema),
});
export type OrderDto = z.infer<typeof orderDtoSchema>;

export const orderProblemSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  details: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

/** RF-ORD-05: la simulación sin emitir. */
export const orderCheckResponseSchema = z.object({
  problems: z.array(orderProblemSchema),
  warnings: z.array(z.object({ field: z.string(), message: z.string() })),
  allocationBalanceTons: tons,
  afterTons: tons,
  capacityTons: tons,
});
export type OrderCheckResponse = z.infer<typeof orderCheckResponseSchema>;

export const draftDtoSchema = z.object({
  id: z.uuid(),
  clientDraftId: z.uuid(),
  ownerId: z.uuid(),
  ownerName: z.string(),
  visibility: z.enum(['private', 'shared']),
  payload: draftPayloadSchema,
  lockedById: z.uuid().nullable(),
  lockedByName: z.string().nullable(),
  lockExpiresAt: at.nullable(),
  updatedAt: at,
  issuedOrderId: z.uuid().nullable(),
});
export type DraftDto = z.infer<typeof draftDtoSchema>;

export const saveDraftSchema = z.object({
  clientDraftId: z.uuid(),
  visibility: z.enum(['private', 'shared']),
  payload: draftPayloadSchema,
});

/** RF-ORD-08: los borradores locales que se suben al reconectar, como privados. */
export const syncDraftsSchema = z.object({
  drafts: z.array(z.object({ clientDraftId: z.uuid(), payload: draftPayloadSchema })).max(200),
});

/** RF-ORD-21: el PDF de una versión, original o copia, en base64 dentro del JSON (como las imágenes de F3). */
export const pdfFileSchema = z.object({
  kind: z.enum(['original', 'copy']),
  fileName: z.string(),
  mime: z.literal('application/pdf'),
  base64: z.string(),
});
