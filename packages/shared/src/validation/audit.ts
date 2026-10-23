// T104 · plan §6.2 (GET /audit), RF-BIT-02, 03: la bitácora por páginas, de la más reciente a la más antigua. No se
// copia al dispositivo: se consulta al servidor.
import { z } from 'zod';
import { auditFilterSchema } from './forms/F17.ts';

export const AUDIT_PAGE = 50;

export const auditQuerySchema = auditFilterSchema.and(
  z.object({
    /** El id de la última fila de la página anterior. */
    before: z.coerce.number().int().positive().optional(),
  }),
);

export const auditEntryDtoSchema = z.object({
  id: z.number().int(),
  at: z.iso.datetime(),
  userName: z.string().nullable(),
  deviceName: z.string().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  /** Número de orden o de DM, nombre del buque o del usuario: lo que la persona reconoce. */
  entityLabel: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
  ok: z.boolean(),
});
export type AuditEntryDto = z.infer<typeof auditEntryDtoSchema>;

export const auditPageSchema = z.object({
  entries: z.array(auditEntryDtoSchema),
  /** Para pedir la siguiente página (`before`); null si no hay más. */
  next: z.number().int().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;
