// Arranca la app Nest completa contra la base de una suite (T028 en adelante): las pruebas de endpoints usan los mismos
// módulos, guardas y filtros que producción; solo cambian el reloj, la versión mínima y la base.
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Clock } from '@impocaribe/shared';
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
  close(): Promise<void>;
}

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
  const app = configureApp(moduleRef.createNestApplication({ logger: process.env.TEST_LOG ? ['error'] : false }));
  const lan = lanAddress();
  let base: string;
  if (lan) {
    await app.listen(0, '0.0.0.0');
    const port = new URL(await app.getUrl()).port;
    base = `http://127.0.0.1:${port}/api/v1`;
  } else {
    base = `${await listenForTests(app)}/api/v1`;
  }
  return {
    app,
    base,
    lanBase: lan ? base.replace('127.0.0.1', lan) : null,
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
