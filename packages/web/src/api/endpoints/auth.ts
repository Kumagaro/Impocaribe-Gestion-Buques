// T038 · plan §6.2: primer arranque y autenticación. Las rutas y sus esquemas son los del servidor (contrato, T026).
import {
  changePasswordSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  recoverSchema,
  recoveryCodesResponseSchema,
  sessionsResponseSchema,
  setupResponseSchema,
  setupSchema,
  setupStatusSchema,
} from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;

export const getSetupStatus = defineEndpoint({ method: 'GET', path: '/setup/status', output: setupStatusSchema, roles: 'public' });
export const postSetup = defineEndpoint({
  method: 'POST',
  path: '/setup',
  input: setupSchema,
  output: setupResponseSchema,
  roles: 'public',
});

export const postLogin = defineEndpoint({
  method: 'POST',
  path: '/auth/login',
  input: loginRequestSchema,
  output: loginResponseSchema,
  roles: 'public',
});
export const postLogout = defineEndpoint({ method: 'POST', path: '/auth/logout', roles: ALL });
export const getMe = defineEndpoint({ method: 'GET', path: '/auth/me', output: meResponseSchema, roles: ALL });
export const getSessions = defineEndpoint({ method: 'GET', path: '/auth/sessions', output: sessionsResponseSchema, roles: ALL });
export const deleteSession = defineEndpoint({ method: 'DELETE', path: '/auth/sessions/:id', roles: ALL });
export const deleteOtherSessions = defineEndpoint({ method: 'DELETE', path: '/auth/sessions', roles: ALL });
export const postChangePassword = defineEndpoint({
  method: 'POST',
  path: '/auth/change-password',
  input: changePasswordSchema,
  roles: ALL,
});
export const postRecoveryCodes = defineEndpoint({
  method: 'POST',
  path: '/auth/recovery-codes',
  output: recoveryCodesResponseSchema,
  roles: ALL,
});
export const postRecover = defineEndpoint({
  method: 'POST',
  path: '/auth/recover',
  input: recoverSchema,
  errors: ['RECOVERY_FAILED', 'RECOVERY_LOCKED'],
  roles: 'public',
});
