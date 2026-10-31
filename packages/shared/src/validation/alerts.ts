// T092 · plan §4.2 y §6.2 (Alertas): el DTO que publica el servidor y guarda la copia local de cada usuario (cada uno
// recibe las que ve, RF-ALR-05), y la consulta del centro de alertas.
import { z } from 'zod';
import { SERVER_ALERT_TYPES } from '../domain/alerts.ts';

export const alertDtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(SERVER_ALERT_TYPES as [string, ...string[]]),
  kind: z.enum(['condition', 'event']),
  /** Lo que se dice fuera de la app: el tipo y la referencia (RF-ALR-02), «DM 00437 pendiente de total». */
  title: z.string(),
  /** La explicación completa. */
  detail: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  targetUserId: z.uuid().nullable(),
  status: z.enum(['open', 'resolved', 'attended']),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  attendedByName: z.string().nullable(),
  attendedAt: z.iso.datetime().nullable(),
});
export type AlertDto = z.infer<typeof alertDtoSchema>;

export const alertsQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'attended']).optional(),
  type: z.string().optional(),
});
