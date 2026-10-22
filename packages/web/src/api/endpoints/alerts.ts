// T092 y T096 · plan §6.2 (Alertas): el centro de alertas (P-17). La lista sale de la copia local; atender va al
// servidor. Las rutas y sus esquemas son los del servidor (contrato, T026).
import { alertDtoSchema } from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;

export const alertsApi = {
  list: defineEndpoint({ method: 'GET', path: '/alerts', output: z.array(alertDtoSchema), roles: ALL }),
  attend: defineEndpoint({ method: 'POST', path: '/alerts/:id/attend', output: alertDtoSchema, roles: ALL }),
};
