// T113 · plan §6.2 (Actualizaciones): las versiones publicadas, la consulta de si hay una nueva (pública: la usa
// también una app desactualizada) y marcar la mínima. Publicar (multipart) llega con P-26 (T114).
import { releaseDtoSchema, updateCheckSchema } from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

export const updatesApi = {
  list: defineEndpoint({
    method: 'GET',
    path: '/updates',
    output: z.array(releaseDtoSchema),
    roles: ['apoderada', 'operador', 'lectura'],
  }),
  check: defineEndpoint({ method: 'GET', path: '/updates/check', output: updateCheckSchema, roles: 'public' }),
  minSupported: defineEndpoint({
    method: 'POST',
    path: '/updates/:id/min-supported',
    output: releaseDtoSchema,
    roles: ['apoderada'],
  }),
};
