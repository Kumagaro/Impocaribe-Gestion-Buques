import { healthResponseSchema } from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

/** Comprueba que llega al servidor y trae su hora (P-01, P-30). */
export const getHealth = defineEndpoint({
  method: 'GET',
  path: '/health',
  output: healthResponseSchema,
  roles: 'public',
});
