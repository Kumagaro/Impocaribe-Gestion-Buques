// T038 · El servidor real visto desde la prueba: lo que haría la pantalla del servidor (P-29, interfaz local) y un
// dispositivo emparejado con sesión para preparar datos, con el mismo cliente firmado que usa la app (DT-24).
import { createApiClient } from '../../src/api/client';
import { postLogin } from '../../src/api/endpoints/auth';
import { postPairSelf } from '../../src/api/endpoints/pairing';
import { SERVER_URL } from './env';

const APP_VERSION = '0.0.0';

function client(device: { id: string; secret: string } | null, token: () => string | null = () => null) {
  return createApiClient({
    baseUrl: SERVER_URL,
    appVersion: APP_VERSION,
    getToken: async () => token(),
    getDevice: async () => device,
    now: () => new Date(),
    transport: (url, init) => fetch(url, init),
  });
}

/** La interfaz local de la PC servidor: la prueba corre en el mismo equipo (127.0.0.1). */
async function local<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}/local${path}`, {
    method,
    headers: { 'X-App-Version': APP_VERSION, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
  });
  if (!res.ok) throw new Error(`${method} /local${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** P-29: confirma en "la pantalla del servidor" la solicitud que muestra `code`; falla si no hay ninguna con ese código. */
export async function confirmPairingCode(code: string): Promise<void> {
  const pending = await local<{ id: string; code: string }[]>('GET', '/pairing');
  const request = pending.find((p) => p.code === code);
  if (!request) throw new Error(`Ninguna solicitud pendiente muestra el código ${code} (hay ${pending.length}).`);
  await local('POST', `/pairing/${request.id}/confirm`);
}

/** Un dispositivo de la PC servidor con la sesión de `username`, para preparar datos por la API. */
export async function signedInDevice(username: string, password: string) {
  const ids = await client(null).request(postPairSelf, { body: { deviceName: 'Pruebas E2E', platform: 'windows' } });
  let token: string | null = null;
  const api = client({ id: ids.deviceId, secret: ids.deviceSecret }, () => token);
  const res = await api.request(postLogin, {
    body: { username, password, deviceId: ids.deviceId, deviceLabel: 'Pruebas E2E', platform: 'windows' },
  });
  token = res.token;
  return api;
}
