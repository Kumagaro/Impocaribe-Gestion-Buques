import { pairingCode } from '@impocaribe/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeServer, FIXED_TIME } from '../../test/fake-server';
import { ApiError, createApiClient } from '../api/client';
import { getPairingRequest, postPairingQr, postPairingRequest } from '../api/endpoints/pairing';
import { createTestPlatform } from '../platform/test-platform';
import { loadPairing, pairWithQr, parseQrPayload, savePairing, startCodePairing, waitForConfirmation } from './pairing';

// T036 · RF-RED-04 y plan §9: emparejamiento desde la app, por código de comparación o por QR. El código se calcula en
// el dispositivo con la huella de la CA que ve y los dos nonces; si alguien se interpone, no coincide con el del servidor.
const REAL_FP = 'B2:99:E6:FB:83:56:99:BC';
const INTRUDER_FP = 'AA:AA:AA:AA:83:56:99:BC';
const SERVER = {
  address: '192.168.1.10',
  port: 8443,
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: REAL_FP,
  version: '1.0.0',
  method: 'dnssd' as const,
};
const DEVICE = { deviceName: 'Teléfono de patio', platform: 'android' as const };
const REQUEST_ID = '0192a3b4-0000-7000-8000-0000000000a1';

function setup() {
  const fake = createFakeServer();
  const api = createApiClient({
    baseUrl: fake.baseUrl,
    appVersion: '1.0.0',
    getToken: async () => null,
    now: () => new Date(FIXED_TIME),
    transport: fake.transport,
  });
  return { fake, api };
}

/** El servidor calcula el código con su CA real, como en pairing.controller.ts. */
const serverSideCode = (clientNonce: string, serverNonce: string) => pairingCode(REAL_FP, clientNonce, serverNonce);

afterEach(() => {
  vi.useRealTimers();
});

describe('startCodePairing', () => {
  it('envía un nonce aleatorio propio y muestra el mismo código que la pantalla del servidor', async () => {
    const { fake, api } = setup();
    fake.respond(postPairingRequest, {
      requestId: REQUEST_ID,
      serverNonce: 'nonce-del-servidor',
      expiresAt: '2026-10-14T16:45:00.000Z',
    });
    const started = await startCodePairing(api, SERVER, DEVICE);
    const sent = fake.calls[0]!.body as { clientNonce: string; deviceName: string; platform: string };
    expect([sent.deviceName, sent.platform, sent.clientNonce.length >= 43]).toEqual([
      'Teléfono de patio',
      'android',
      true,
    ]);
    expect(started).toEqual({
      requestId: REQUEST_ID,
      clientNonce: sent.clientNonce,
      code: await serverSideCode(sent.clientNonce, 'nonce-del-servidor'),
      expiresAt: '2026-10-14T16:45:00.000Z',
    });
  });

  it('dos solicitudes no repiten el nonce', async () => {
    const { fake, api } = setup();
    fake.respond(postPairingRequest, { requestId: REQUEST_ID, serverNonce: 's', expiresAt: FIXED_TIME });
    const a = await startCodePairing(api, SERVER, DEVICE);
    const b = await startCodePairing(api, SERVER, DEVICE);
    expect(a.clientNonce).not.toBe(b.clientNonce);
  });

  it('un intermediario con otra CA produce un código distinto en cada extremo', async () => {
    const { fake, api } = setup();
    fake.respond(postPairingRequest, {
      requestId: REQUEST_ID,
      serverNonce: 'nonce-del-servidor',
      expiresAt: FIXED_TIME,
    });
    // El dispositivo habla con el intruso: ve la huella de la CA del intruso.
    const seen = await startCodePairing(api, { ...SERVER, caFingerprint: INTRUDER_FP }, DEVICE);
    expect(seen.code).not.toBe(await serverSideCode(seen.clientNonce, 'nonce-del-servidor'));
  });

  it('un intermediario que cambia el nonce del servidor también descuadra los códigos', async () => {
    const { fake, api } = setup();
    fake.respond(postPairingRequest, { requestId: REQUEST_ID, serverNonce: 'nonce-cambiado', expiresAt: FIXED_TIME });
    const seen = await startCodePairing(api, SERVER, DEVICE);
    expect(seen.code).not.toBe(await serverSideCode(seen.clientNonce, 'nonce-del-servidor'));
  });
});

describe('waitForConfirmation', () => {
  it('consulta hasta que el servidor confirma y devuelve el secreto del dispositivo', async () => {
    vi.useFakeTimers();
    const { fake, api } = setup();
    let polls = 0;
    fake.respond(getPairingRequest, () =>
      ++polls < 3 ? { status: 'pending' } : { status: 'confirmed', deviceId: 'dev-1', deviceSecret: 'secreto' },
    );
    const promise = waitForConfirmation(api, REQUEST_ID, 'mi-nonce');
    await vi.runAllTimersAsync();
    expect(await promise).toEqual({ deviceId: 'dev-1', deviceSecret: 'secreto' });
    expect(fake.calls.map((c) => c.query.get('clientNonce'))).toEqual(['mi-nonce', 'mi-nonce', 'mi-nonce']);
  });

  it('si se rechaza en el servidor, lo dice con el mensaje del servidor', async () => {
    const { fake, api } = setup();
    fake.respond(getPairingRequest, {
      code: 'PAIRING_REJECTED',
      message: 'El emparejamiento se rechazó en la pantalla del servidor.',
    });
    const err = await waitForConfirmation(api, REQUEST_ID, 'n').catch((e: unknown) => e);
    expect([err instanceof ApiError, (err as ApiError).code]).toEqual([true, 'PAIRING_REJECTED']);
  });
});

describe('QR (RF-RED-04)', () => {
  const payload = {
    serverId: SERVER.serverId,
    caFingerprint: REAL_FP,
    qrToken: 'token-de-un-uso',
    address: '192.168.1.10',
    port: 8443,
  };

  it('lee el QR del servidor y rechaza uno que no lo es', () => {
    expect(parseQrPayload(JSON.stringify(payload))).toEqual(payload);
    expect(parseQrPayload('https://ejemplo.com')).toBeNull();
    expect(parseQrPayload(JSON.stringify({ ...payload, port: 0 }))).toBeNull();
  });

  it('empareja con el token del QR, sin código', async () => {
    const { fake, api } = setup();
    fake.respond(postPairingQr, { deviceId: 'dev-qr', deviceSecret: 'secreto-qr' });
    expect(await pairWithQr(api, payload, DEVICE)).toEqual({ deviceId: 'dev-qr', deviceSecret: 'secreto-qr' });
    expect(fake.calls[0]!.body).toEqual({
      qrToken: 'token-de-un-uso',
      deviceName: 'Teléfono de patio',
      platform: 'android',
    });
  });
});

describe('lo aprendido al emparejarse se guarda en el almacenamiento seguro', () => {
  it('identidad, huella, dirección y secreto, y nada en el almacenamiento del navegador', async () => {
    const platform = await createTestPlatform();
    const record = {
      serverId: SERVER.serverId,
      serverName: 'IMPOCARIBE-7F3A',
      caFingerprint: REAL_FP,
      lastAddress: { address: '192.168.1.10', port: 8443 },
      deviceId: 'dev-1',
      deviceSecret: 'secreto',
    };
    await savePairing(platform.secureStorage, record);
    expect(await loadPairing(platform.secureStorage)).toEqual(record);
    expect(localStorage.length).toBe(0);
  });

  it('sin emparejar, no hay nada', async () => {
    const platform = await createTestPlatform();
    expect(await loadPairing(platform.secureStorage)).toBeNull();
  });
});
