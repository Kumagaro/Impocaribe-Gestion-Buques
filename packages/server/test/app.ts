// Arranca la app Nest completa contra la base de una suite (T028 en adelante): las pruebas de endpoints usan los mismos
// módulos, guardas y filtros que producción; solo cambian el reloj, la versión mínima y la base.
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { signRequest, type Clock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { networkInterfaces } from 'node:os';
import { AppModule } from '../src/app.module.ts';
import { configureApp } from '../src/app.ts';
import { CLOCK, DB, MIN_APP_VERSION, SERVER_INFO } from '../src/tokens.ts';
import { listenForTests } from './listen.ts';
import type { SuiteDb } from './suite-db.ts';

export interface TestApp {
  app: INestApplication;
  /** URL base por 127.0.0.1 (la propia PC servidor). */
  base: string;
  /** URL base por una dirección de la red local, como la vería otro equipo (null si el equipo no tiene red). */
  lanBase: string | null;
  /**
   * fetch firmado como un dispositivo emparejado (DT-24). El dispositivo es el de X-Device-Id, el de la sesión del
   * token o el deviceId del cuerpo del login; si no existe, se empareja en la base de la suite.
   */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export const TEST_DEVICE = 'dispositivo-de-pruebas';
export const deviceSecret = (id: string) => `secreto-${id}`;

/** Primera IPv4 que no es de bucle local: las peticiones por ella no llegan desde 127.0.0.1. */
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    const found = list?.find((i) => i.family === 'IPv4' && !i.internal);
    if (found) return found.address;
  }
  return null;
}

export async function createTestApp(suite: SuiteDb, clock: Clock, controllers: Type[] = []): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(MIN_APP_VERSION)
    .useValue('1.0.0')
    // Identidad fija de las pruebas: la real se lee de identity.json (T033).
    .overrideProvider(SERVER_INFO)
    .useValue({
      serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
      name: 'IMPOCARIBE-7F3C',
      version: '1.0.0-test',
      caFingerprint: 'AA:BB',
    })
    .overrideProvider(DB)
    .useValue(drizzle(suite.app))
    .compile();
  // rawBody como en producción (createApp): la firma del dispositivo y la idempotencia usan el cuerpo tal como llegó.
  const app = configureApp(
    moduleRef.createNestApplication({ logger: process.env.TEST_LOG ? ['error'] : false, rawBody: true }),
  );
  const lan = lanAddress();
  let base: string;
  if (lan) {
    await app.listen(0, '0.0.0.0');
    const port = new URL(await app.getUrl()).port;
    base = `http://127.0.0.1:${port}/api/v1`;
  } else {
    base = `${await listenForTests(app)}/api/v1`;
  }
  const tokenDevice = new Map<string, string>();
  let seq = 0;
  const signedFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    const body = typeof init.body === 'string' ? init.body : '';
    const token = headers.Authorization?.replace('Bearer ', '');
    let fromBody: string | undefined;
    if (body) fromBody = (JSON.parse(body) as { deviceId?: string }).deviceId;
    const deviceId = headers['X-Device-Id'] ?? (token && tokenDevice.get(token)) ?? fromBody ?? TEST_DEVICE;
    await suite.admin.query(
      "INSERT INTO devices (id, name, platform, secret, paired_at, paired_method) VALUES ($1, $1, 'windows', $2, now(), 'code') ON CONFLICT (id) DO NOTHING",
      [deviceId, deviceSecret(deviceId)],
    );
    // Cada petición con su propia hora (en ms), para que dos peticiones iguales no parezcan una repetición.
    const time = String(clock.now().getTime() + (seq++ % 60_000));
    const u = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();
    const signature = await signRequest({ method, path: u.pathname + u.search, time, body }, deviceSecret(deviceId));
    const res = await fetch(url, {
      ...init,
      headers: { ...headers, 'X-Device-Id': deviceId, 'X-Device-Time': time, 'X-Device-Signature': signature },
    });
    if (res.ok && u.pathname.endsWith('/auth/login')) {
      const json = (await res.clone().json()) as { token?: string };
      if (json.token) tokenDevice.set(json.token, deviceId);
    }
    return res;
  };
  return {
    app,
    base,
    lanBase: lan ? base.replace('127.0.0.1', lan) : null,
    fetch: signedFetch,
    close: () => app.close(),
  };
}

let keySeq = 0;
/** Cabeceras de una app 1.0.0, con una clave de idempotencia nueva en cada escritura (DT-11, DT-22). */
export function appHeaders(extra: Record<string, string> = {}): Record<string, string> {
  keySeq++;
  return {
    'X-App-Version': '1.0.0',
    'Content-Type': 'application/json',
    'Idempotency-Key': `0192a3b4-0000-7000-8000-${String(keySeq).padStart(12, '0')}`,
    ...extra,
  };
}
