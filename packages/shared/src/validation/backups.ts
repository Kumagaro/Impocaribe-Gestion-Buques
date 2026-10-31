// T106 · plan §6.2 (Respaldos): la lista de respaldos de P-24, solo para Apoderadas.
import { z } from 'zod';

export const backupDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['hourly', 'daily', 'manual', 'pre_restore']),
  status: z.enum(['running', 'ok', 'failed']),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** false: el archivo ya se borró por la retención (se conserva el registro). */
  available: z.boolean(),
  sizeBytes: z.number().int().nullable(),
  sha256: z.string().nullable(),
  error: z.string().nullable(),
  externalPath: z.string().nullable(),
  externalCopiedAt: z.iso.datetime().nullable(),
  createdByName: z.string().nullable(),
});
export type BackupDto = z.infer<typeof backupDtoSchema>;

/** T109 · RF-RES-06, 07: una orden perdida en una restauración, para recuperarla o descartarla en P-24. */
export const lostOrderDtoSchema = z.object({
  id: z.uuid(),
  restoreId: z.uuid(),
  number: z.string(),
  declarationNumber: z.string(),
  clientName: z.string(),
  truckPlate: z.string(),
  tons: z.string(),
  loadingDate: z.iso.date(),
  issuedAt: z.iso.datetime(),
  issuedByName: z.string().nullable(),
  /** Estado que tenía la orden (oficial o anulada). */
  orderStatus: z.enum(['official', 'voided']),
  status: z.enum(['pending', 'recovered', 'discarded']),
  lastError: z.string().nullable(),
  discardReason: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type LostOrderDto = z.infer<typeof lostOrderDtoSchema>;
