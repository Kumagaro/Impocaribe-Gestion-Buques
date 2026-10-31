// T036 · plan §6.2: descubrimiento y emparejamiento (rutas públicas: el dispositivo aún no tiene secreto).
import {
  discoveryResponseSchema,
  pairedDeviceSchema,
  pairingRequestResponseSchema,
  pairingRequestSchema,
  pairingStatusSchema,
  qrPairSchema,
  qrResponseSchema,
  selfPairSchema,
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

// El QR de un solo uso de la pantalla del servidor (P-28 al terminar, P-29): solo desde la propia PC servidor.
export const postLocalQr = defineEndpoint({
  method: 'POST',
  path: '/local/qr',
  output: qrResponseSchema,
  roles: 'public',
});

// La app de la propia PC servidor se empareja sola por la interfaz local (P-01); el servidor lo comprueba (T035).
export const postPairSelf = defineEndpoint({
  method: 'POST',
  path: '/local/pair-self',
  input: selfPairSchema,
  output: pairedDeviceSchema,
  roles: 'public',
});
