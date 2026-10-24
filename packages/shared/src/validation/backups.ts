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
