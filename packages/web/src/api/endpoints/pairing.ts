// T036 · plan §6.2: descubrimiento y emparejamiento (rutas públicas: el dispositivo aún no tiene secreto).
import {
  discoveryResponseSchema,
  pairedDeviceSchema,
  pairingRequestResponseSchema,
  pairingRequestSchema,
  pairingStatusSchema,
  qrPairSchema,
} from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

export const getDiscovery = defineEndpoint({
  method: 'GET',
  path: '/discovery',
  output: discoveryResponseSchema,
  roles: 'public',
});

export const postPairingRequest = defineEndpoint({
  method: 'POST',
  path: '/pairing/requests',
  input: pairingRequestSchema,
  output: pairingRequestResponseSchema,
  roles: 'public',
});

export const getPairingRequest = defineEndpoint({
  method: 'GET',
  path: '/pairing/requests/:id',
  output: pairingStatusSchema,
  errors: ['PAIRING_REJECTED', 'PAIRING_EXPIRED'],
  roles: 'public',
});

export const postPairingQr = defineEndpoint({
  method: 'POST',
  path: '/pairing/qr',
  input: qrPairSchema,
  output: pairedDeviceSchema,
  errors: ['PAIRING_EXPIRED'],
  roles: 'public',
});
