// T040 · plan §6.2: usuarios (P-21), solo la Apoderada. Las rutas y sus esquemas son los del servidor (contrato, T026).
import {
  editUserSchema,
  newUserSchema,
  resetPasswordSchema,
  setupResponseSchema,
  userDtoSchema,
  userListSchema,
} from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

const A = ['apoderada'] as const;

export const getUsers = defineEndpoint({ method: 'GET', path: '/users', output: userListSchema, roles: A });
export const postUser = defineEndpoint({
  method: 'POST',
  path: '/users',
  input: newUserSchema,
  output: setupResponseSchema,
  errors: ['DUPLICATE_NATIONAL_ID'],
  roles: A,
});
export const patchUser = defineEndpoint({
  method: 'PATCH',
  path: '/users/:id',
  input: editUserSchema,
  output: userDtoSchema,
  errors: ['DUPLICATE_NATIONAL_ID', 'LAST_APODERADA', 'STALE_RECORD'],
  roles: A,
});
export const deactivateUser = defineEndpoint({
  method: 'POST',
  path: '/users/:id/deactivate',
  output: userDtoSchema,
  errors: ['LAST_APODERADA'],
  roles: A,
});
export const activateUser = defineEndpoint({
  method: 'POST',
  path: '/users/:id/activate',
  output: userDtoSchema,
  roles: A,
});
export const resetUserPassword = defineEndpoint({
  method: 'POST',
  path: '/users/:id/reset-password',
  input: resetPasswordSchema,
  output: userDtoSchema,
  roles: A,
});
