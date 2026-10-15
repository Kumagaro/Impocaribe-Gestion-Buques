import { ManualClock } from '@impocaribe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';

// T034 · plan §6.2: GET /discovery es público y devuelve {serverId, name, version, caFingerprint} (RF-RED-02, 03).
let suite: SuiteDb;
let t: TestApp;

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, new ManualClock('2026-10-15T12:00:00.000Z'));
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

describe('GET /discovery', () => {
  it('sin sesión ni dispositivo, devuelve la identidad pública del servidor', async () => {
    const res = await fetch(`${t.base}/discovery`);
    expect([res.status, await res.json()]).toEqual([
      200,
      {
        serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
        name: 'IMPOCARIBE-7F3C',
        version: '1.0.0-test',
        caFingerprint: 'AA:BB',
      },
    ]);
  });
});
