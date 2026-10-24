// T105 · plan §6.2 (Respaldos): la contraseña de respaldo, solo para Apoderadas. Las rutas y sus esquemas son los del
// servidor (contrato, T026).
import {
  backupDtoSchema,
  backupPasswordSchema,
  backupPasswordStatusSchema,
  confirmNumberingSchema,
  lostOrderDtoSchema,
  numberingStatusSchema,
  reasonSchema,
  restoreResultSchema,
  restoreSchema,
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

/** T107 y T108: restaurar y confirmar la numeración. */
export const restoresApi = {
  restore: defineEndpoint({
    method: 'POST',
    path: '/restores',
    input: restoreSchema,
    output: restoreResultSchema,
    errors: ['BACKUP_PASSWORD_INVALID', 'RESTORE_IN_PROGRESS'],
    roles: A,
  }),
  numbering: defineEndpoint({ method: 'GET', path: '/restores/numbering', output: numberingStatusSchema, roles: A }),
  confirmNumbering: defineEndpoint({
    method: 'POST',
    path: '/restores/numbering',
    input: confirmNumberingSchema,
    output: numberingStatusSchema,
    roles: A,
  }),
};

/** T109: las órdenes perdidas en una restauración. */
export const lostOrdersApi = {
  list: defineEndpoint({ method: 'GET', path: '/lost-orders', output: z.array(lostOrderDtoSchema), roles: A }),
  recover: defineEndpoint({
    method: 'POST',
    path: '/lost-orders/:id/recover',
    output: lostOrderDtoSchema,
    errors: ['OVERDRAFT_ALLOCATION'],
    roles: A,
  }),
  discard: defineEndpoint({
    method: 'POST',
    path: '/lost-orders/:id/discard',
    input: z.object({ reason: reasonSchema }),
    output: lostOrderDtoSchema,
    roles: A,
  }),
};
