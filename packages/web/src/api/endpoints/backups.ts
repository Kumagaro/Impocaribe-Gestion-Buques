// T105 · plan §6.2 (Respaldos): la contraseña de respaldo, solo para Apoderadas. Las rutas y sus esquemas son los del
// servidor (contrato, T026).
import {
  backupDtoSchema,
  backupPasswordSchema,
  backupPasswordStatusSchema,
  setBackupPasswordSchema,
} from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

const A = ['apoderada'] as const;

export const backupsApi = {
  list: defineEndpoint({ method: 'GET', path: '/backups', output: z.array(backupDtoSchema), roles: A }),
  manual: defineEndpoint({ method: 'POST', path: '/backups', output: backupDtoSchema, roles: A }),
};

export const backupPasswordApi = {
  status: defineEndpoint({ method: 'GET', path: '/backups/password', output: backupPasswordStatusSchema, roles: A }),
  set: defineEndpoint({
    method: 'PUT',
    path: '/backups/password',
    input: setBackupPasswordSchema,
    output: backupPasswordStatusSchema,
    errors: ['BACKUP_PASSWORD_INVALID'],
    roles: A,
  }),
  confirm: defineEndpoint({
    method: 'POST',
    path: '/backups/password/confirm',
    input: backupPasswordSchema,
    output: backupPasswordStatusSchema,
    errors: ['BACKUP_PASSWORD_INVALID'],
    roles: A,
  }),
  postpone: defineEndpoint({
    method: 'POST',
    path: '/backups/password/postpone',
    output: backupPasswordStatusSchema,
    roles: A,
  }),
};
