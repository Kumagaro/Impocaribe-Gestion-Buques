// T042 · plan §6.2 (Sincronización): las tres llamadas del motor de sincronización (T045). Contrato del servidor (T026).
import { syncChangesResponseSchema, syncSnapshotResponseSchema, syncStateSchema } from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;

export const getSyncState = defineEndpoint({ method: 'GET', path: '/sync/state', output: syncStateSchema, roles: ALL });
export const getSyncChanges = defineEndpoint({
  method: 'GET',
  path: '/sync/changes',
  output: syncChangesResponseSchema,
  errors: ['RESYNC_REQUIRED'],
  roles: ALL,
});
export const getSyncSnapshot = defineEndpoint({
  method: 'GET',
  path: '/sync/snapshot',
  output: syncSnapshotResponseSchema,
  roles: ALL,
});
