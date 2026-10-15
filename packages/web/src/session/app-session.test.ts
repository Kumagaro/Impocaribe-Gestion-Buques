import { signRequest } from '@impocaribe/shared';
import { describe, expect, it } from 'vitest';
import { FIXED_TIME, sampleOf } from '../../test/fake-server';
import { getMe } from '../api/endpoints/auth';
import { savePairing, type PairingRecord } from '../connection/pairing';
import { createTestPlatform } from '../platform/test-platform';
import { AppSession, SESSION_KEY } from './app-session';
import { meResponseSchema, userDtoSchema } from '@impocaribe/shared/validation';

// T038 · Estado de la app: emparejamiento (RF-RED-04), sesión (RF-AUT-02, 08) y el cliente de API que firma con el
// dispositivo (DT-24). Lo sensible vive en el almacenamiento seguro del dispositivo (plan §9).
const PAIRING: PairingRecord = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  serverName: 'IMPOCARIBE-7F3C',
  deviceName: 'Teléfono de patio',
  isServerPc: false,
  caFingerprint: 'AA:BB',
  lastAddress: { address: '192.168.1.10', port: 8443 },
  deviceId: 'dev-1',
  deviceSecret: 'secreto-del-dispositivo',
};
const USER = sampleOf(userDtoSchema, { role: 'operador', nationalId: '84011905548', phone: '52345678' });

async function setup(responses: Response[] = []) {
  const sent: { url: string; init: RequestInit }[] = [];
  const platform = await createTestPlatform({
    http: async (url, init) => {
      sent.push({ url, init });
      return responses.shift() ?? new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { platform, sent, session: new AppSession(platform, '1.0.0', () => new Date(FIXED_TIME)) };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('AppSession.load', () => {
  it('sin emparejar, el estado es "sin emparejar"', async () => {
    const { session } = await setup();
    await session.load();
    expect(session.getState()).toEqual({ status: 'unpaired', pairing: null, session: null });
  });

  it('emparejado y sin sesión, pide iniciar sesión; con sesión guardada, entra', async () => {
    const { platform, session } = await setup();
    await savePairing(platform.secureStorage, PAIRING);
    await session.load();
    expect(session.getState().status).toBe('signedOut');
    await platform.secureStorage.set(
      SESSION_KEY,
      JSON.stringify({ token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: USER }),
    );
    await session.load();
    expect(session.getState()).toEqual({
      status: 'signedIn',
      pairing: PAIRING,
      session: { token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: USER },
    });
  });
});

describe('AppSession.api', () => {
  it('habla con la última dirección del servidor emparejado, con el token y la firma del dispositivo', async () => {
    const me = sampleOf(meResponseSchema, { user: USER, permissions: ['view'] });
    const { platform, session, sent } = await setup([json(200, me)]);
    await savePairing(platform.secureStorage, PAIRING);
    await session.load();
    await session.signedIn({ token: 'token-1', expiresAt: '2026-10-15T16:40:00.000Z', user: USER });
    expect(await session.api().request(getMe)).toEqual(me);
    const h = Object.fromEntries(new Headers(sent[0]!.init.headers).entries());
    expect([sent[0]!.url, h.authorization, h['x-device-id']]).toEqual([
      'https://192.168.1.10:8443/api/v1/auth/me',
      'Bearer token-1',
      'dev-1',
    ]);
    expect(h['x-device-signature']).toBe(
      await signRequest(
        { method: 'GET', path: '/api/v1/auth/me', time: h['x-device-time']!, body: '' },
        'secreto-del-dispositivo',
      ),
    );
  });

  it('sin emparejar no hay a quién llamar', async () => {
    const { session } = await setup();
    await session.load();
    expect(() => session.api()).toThrow('Este dispositivo no está emparejado con el servidor.');
  });

  it('RF-AUT-08: si el servidor dice que la sesión venció, la borra y pide iniciar sesión', async () => {
    const { platform, session } = await setup([
      json(401, { code: 'SESSION_EXPIRED', message: 'La sesión venció. Inicie sesión de nuevo.' }),
    ]);
    await savePairing(platform.secureStorage, PAIRING);
    await session.load();
    await session.signedIn({ token: 'token-1', expiresAt: '2026-10-15T16:40:00.000Z', user: USER });
    await session
      .api()
      .request(getMe)
      .catch(() => undefined);
    expect([session.getState().status, await platform.secureStorage.get(SESSION_KEY)]).toEqual(['signedOut', null]);
  });
});

describe('cambios de estado', () => {
  it('avisa a quien escucha y guarda la sesión en el almacenamiento seguro', async () => {
    const { platform, session } = await setup();
    await savePairing(platform.secureStorage, PAIRING);
    await session.load();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.getState().status));
    await session.signedIn({ token: 'token-1', expiresAt: '2026-10-15T16:40:00.000Z', user: USER });
    await session.signOut();
    expect(seen).toEqual(['signedIn', 'signedOut']);
    expect(await platform.secureStorage.get(SESSION_KEY)).toBeNull();
  });

  it('al emparejarse queda listo para iniciar sesión', async () => {
    const { session } = await setup();
    await session.load();
    await session.paired(PAIRING);
    expect(session.getState()).toEqual({ status: 'signedOut', pairing: PAIRING, session: null });
  });
});
