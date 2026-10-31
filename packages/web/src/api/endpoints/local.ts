// T128 · P-29 Estado del servidor (plan §6.2): lo que solo se hace ante la PC servidor (`/local/*`, desde 127.0.0.1) y
// la revocación de dispositivos, que pide una Apoderada con sesión (RF-RED-05).
import {
  deviceDtoSchema,
  devicesSchema,
  localApoderadasSchema,
  pendingPairingsSchema,
  serverStatusSchema,
} from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

export const localApi = {
  status: defineEndpoint({ method: 'GET', path: '/local/status', output: serverStatusSchema, roles: 'public' }),
  apoderadas: defineEndpoint({
    method: 'GET',
    path: '/local/apoderadas',
    output: localApoderadasSchema,
    roles: 'public',
  }),
  pairing: defineEndpoint({ method: 'GET', path: '/local/pairing', output: pendingPairingsSchema, roles: 'public' }),
  confirm: defineEndpoint({
    method: 'POST',
    path: '/local/pairing/:id/confirm',
    errors: ['PAIRING_EXPIRED'],
    roles: 'public',
  }),
  reject: defineEndpoint({
    method: 'POST',
    path: '/local/pairing/:id/reject',
    errors: ['PAIRING_EXPIRED'],
    roles: 'public',
  }),
};

export const devicesApi = {
  list: defineEndpoint({ method: 'GET', path: '/devices', output: devicesSchema, roles: ['apoderada'] }),
  revoke: defineEndpoint({
    method: 'POST',
    path: '/devices/:id/revoke',
    output: deviceDtoSchema,
    roles: ['apoderada'],
  }),
};
