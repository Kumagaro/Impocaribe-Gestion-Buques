// T036 · RF-RED-04 y plan §9: emparejamiento desde la app. Por código: la app manda un nonce propio, recibe el del
// servidor y muestra el código que sale de ambos y de la huella de la CA que ve; la persona lo compara con el de la
// pantalla del servidor. Por QR: el token de un solo uso del QR basta. Lo aprendido se guarda en el almacenamiento
// seguro del dispositivo (Keystore o safeStorage), nunca en el del navegador.
import { pairingCode } from '@impocaribe/shared';
import { qrPayloadSchema } from '@impocaribe/shared/validation';
import type { z } from 'zod';
import type { createApiClient } from '../api/client';
import { getPairingRequest, postPairingQr, postPairingRequest } from '../api/endpoints/pairing';
import type { SecureStorage } from '../platform/platform';
import type { FoundServer, PairedServer } from './discovery';

type Api = ReturnType<typeof createApiClient>;
type DeviceDescription = { deviceName: string; platform: 'windows' | 'android' };
export type QrPayload = z.infer<typeof qrPayloadSchema>;

export interface PairingRecord extends PairedServer {
  serverName: string;
  /** El nombre que se le dio a este dispositivo al emparejarlo: identifica sus sesiones (P-05). */
  deviceName: string;
  /** Emparejado por /local: es la app de la propia PC servidor (primer arranque, P-02). */
  isServerPc: boolean;
  deviceId: string;
  deviceSecret: string;
}

/** Clave del almacenamiento seguro donde vive el emparejamiento. */
export const PAIRING_KEY = 'impocaribe.pairing';
/** Cada cuánto pregunta la app si ya se confirmó (la solicitud caduca a los 5 minutos). */
export const CONFIRM_POLL_MS = 1500;

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function startCodePairing(api: Api, server: FoundServer, device: DeviceDescription) {
  const clientNonce = randomNonce();
  const res = await api.request(postPairingRequest, { body: { ...device, clientNonce } });
  return {
    requestId: res.requestId,
    clientNonce,
    // Con la huella de la CA que ve este dispositivo: si hay un intruso en medio, el código no coincidirá.
    code: await pairingCode(server.caFingerprint, clientNonce, res.serverNonce),
    expiresAt: res.expiresAt,
  };
}

/** Espera a que alguien confirme el código en la pantalla del servidor. Un rechazo o la caducidad llegan como ApiError. */
export async function waitForConfirmation(
  api: Api,
  requestId: string,
  clientNonce: string,
  signal?: AbortSignal,
): Promise<{ deviceId: string; deviceSecret: string }> {
  for (;;) {
    const res = await api.request(getPairingRequest, { params: { id: requestId }, query: { clientNonce } });
    if (res.status === 'confirmed') return { deviceId: res.deviceId, deviceSecret: res.deviceSecret };
    if (signal?.aborted) throw signal.reason;
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
}

/** El texto de un QR, si es el de un servidor de Órdenes de Carga; null si es cualquier otra cosa. */
export function parseQrPayload(text: string): QrPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const result = qrPayloadSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function pairWithQr(api: Api, qr: QrPayload, device: DeviceDescription) {
  return api.request(postPairingQr, { body: { qrToken: qr.qrToken, ...device } });
}

export async function savePairing(storage: SecureStorage, record: PairingRecord): Promise<void> {
  await storage.set(PAIRING_KEY, JSON.stringify(record));
}

export async function loadPairing(storage: SecureStorage): Promise<PairingRecord | null> {
  const raw = await storage.get(PAIRING_KEY);
  return raw ? (JSON.parse(raw) as PairingRecord) : null;
}
