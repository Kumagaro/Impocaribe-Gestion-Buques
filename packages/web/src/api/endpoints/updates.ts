// T113 · plan §6.2 (Actualizaciones): las versiones publicadas, la consulta de si hay una nueva (pública: la usa
// también una app desactualizada), publicar (multipart: el archivo y los campos de publishReleaseSchema) y marcar la
// mínima.
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
  publish: defineEndpoint({ method: 'POST', path: '/updates', output: releaseDtoSchema, roles: ['apoderada'] }),
  minSupported: defineEndpoint({
    method: 'POST',
    path: '/updates/:id/min-supported',
    output: releaseDtoSchema,
    roles: ['apoderada'],
  }),
};
