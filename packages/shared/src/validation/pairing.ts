// RF-RED-04 y 05, plan §6.2: emparejamiento por código o QR, administración local y dispositivos.
import { z } from 'zod';
import { PLATFORMS } from './auth.ts';

const deviceName = z.string().trim().min(1, 'Escriba el nombre del dispositivo.').max(60);

export const pairingRequestSchema = z.object({
  deviceName,
  platform: z.enum(PLATFORMS),
  clientNonce: z.string().min(1).max(200),
});
export const pairingRequestResponseSchema = z.object({
  requestId: z.uuid(),
  serverNonce: z.string(),
  expiresAt: z.iso.datetime(),
});
export const pairedDeviceSchema = z.object({ deviceId: z.string(), deviceSecret: z.string() });
export const pairingStatusSchema = z.union([
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('confirmed') }).extend(pairedDeviceSchema.shape),
]);
export const qrPairSchema = z.object({ qrToken: z.string().min(1), deviceName, platform: z.enum(PLATFORMS) });
export const selfPairSchema = z.object({ deviceName, platform: z.enum(PLATFORMS) });

/** Lo que se ve en la pantalla del servidor (P-29): solicitud pendiente con su código. */
export const pendingPairingSchema = z.object({
  id: z.uuid(),
  deviceName: z.string(),
  platform: z.enum(PLATFORMS),
  code: z.string().regex(/^\d{6}$/),
  expiresAt: z.iso.datetime(),
});
export const pendingPairingsSchema = z.array(pendingPairingSchema);
export const qrResponseSchema = z.object({
  qrToken: z.string(),
  serverId: z.uuid(),
  caFingerprint: z.string(),
  expiresAt: z.iso.datetime(),
});

export const deviceDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.enum(PLATFORMS),
  pairedAt: z.iso.datetime(),
  pairedMethod: z.enum(['code', 'qr', 'local']),
  lastSeenAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export const devicesSchema = z.array(deviceDtoSchema);
