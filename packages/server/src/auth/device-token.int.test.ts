import { ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';
import { findDeviceTokenSession, revokeUserSessions } from './sessions.ts';

// T032 · DT-05: un token de dispositivo separado, solo para las alertas del servicio nativo de Android. No sirve para la
// API; vence y se revoca con las reglas de la sesión que lo pidió (Const. art. X.3).
let suite: SuiteDb;
let t: TestApp;
let userId: string;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');

async function appToken(keepSignedIn = false) {
  const res = await t.fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({
      username: 'mario.delgado',
      password: 'contraseña1',
      keepSignedIn,
      deviceId: 'tel-patio',
      deviceLabel: 'Teléfono de patio',
      platform: 'android',
    }),
  });
  return ((await res.json()) as { token: string }).token;
}
const issue = (token: string) =>
  t.fetch(`${t.base}/auth/device-token`, { method: 'POST', headers: appHeaders({ Authorization: `Bearer ${token}` }) });
const deviceSessions = async () =>
  (
    await suite.admin.query(
      "SELECT device_id, revoked_at IS NULL AS live FROM sessions WHERE kind = 'device' ORDER BY created_at, id",
    )
  ).rows;

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock);
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

beforeEach(async () => {
  clock.set('2026-10-14T12:00:00.000Z');
  await suite.admin.query('TRUNCATE users CASCADE');
  const db = drizzle(suite.app);
  userId = (
    await db.transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName: 'Mario Delgado Pérez',
          username: 'mario.delgado',
          nationalId: '84011905548',
          phone: '52345678',
          role: 'operador',
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    )
  ).id;
});

describe('POST /auth/device-token', () => {
  it('emite un token de dispositivo que vence con la sesión que lo pidió', async () => {
    const app = await appToken(true);
    clock.set('2026-10-14T18:00:00.000Z');
    const res = await issue(app);
    const json = (await res.json()) as { token: string; expiresAt: string };
    expect([res.status, json.expiresAt]).toEqual([201, '2026-11-13T12:00:00.000Z']);
    expect(json.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deviceSessions()).toEqual([{ device_id: 'tel-patio', live: true }]);
  });

  it('el servicio de alertas lo reconoce mientras está vigente', async () => {
    const { token } = (await (await issue(await appToken())).json()) as { token: string };
    const db = drizzle(suite.app);
    expect(await findDeviceTokenSession(db, clock, token)).toEqual({ userId, deviceId: 'tel-patio' });
    clock.set('2026-10-15T12:00:00.000Z');
    expect(await findDeviceTokenSession(db, clock, token)).toBeNull();
  });

  it('no sirve para la API de la app', async () => {
    const { token } = (await (await issue(await appToken())).json()) as { token: string };
    const me = await t.fetch(`${t.base}/auth/me`, { headers: appHeaders({ Authorization: `Bearer ${token}` }) });
    expect(me.status).toBe(401);
  });

  it('pedirlo otra vez desde el mismo dispositivo reemplaza el anterior', async () => {
    const app = await appToken();
    await issue(app);
    await issue(app);
    expect(await deviceSessions()).toEqual([
      { device_id: 'tel-patio', live: false },
      { device_id: 'tel-patio', live: true },
    ]);
  });

  it('se revoca junto con las sesiones del usuario (cambio de rol, contraseña, desactivación)', async () => {
    const { token } = (await (await issue(await appToken())).json()) as { token: string };
    const db = drizzle(suite.app);
    await db.transaction((tx) => revokeUserSessions(tx, clock, userId));
    expect(await findDeviceTokenSession(db, clock, token)).toBeNull();
  });

  it('sin sesión no se emite', async () => {
    const res = await t.fetch(`${t.base}/auth/device-token`, { method: 'POST', headers: appHeaders() });
    expect(res.status).toBe(401);
  });
});

describe('DT-05: el token de alertas vive y muere con la sesión de su dispositivo', () => {
  const live = async (token: string) => (await findDeviceTokenSession(drizzle(suite.app), clock, token)) !== null;
  const call = (token: string, path: string, method: string) =>
    t.fetch(`${t.base}${path}`, { method, headers: appHeaders({ Authorization: `Bearer ${token}` }) });

  it('al cerrar la sesión (logout) deja de valer', async () => {
    const app = await appToken();
    const { token } = (await (await issue(app)).json()) as { token: string };
    await call(app, '/auth/logout', 'POST');
    expect(await live(token)).toBe(false);
  });

  it('al cerrar esa sesión desde otro dispositivo deja de valer', async () => {
    const phone = await appToken();
    const { token } = (await (await issue(phone)).json()) as { token: string };
    const pc = await appTokenFrom('pc-oficina');
    const list = (await (await call(pc, '/auth/sessions', 'GET')).json()) as { id: string; current: boolean }[];
    await call(pc, `/auth/sessions/${list.find((x) => !x.current)!.id}`, 'DELETE');
    expect(await live(token)).toBe(false);
  });

  it('cerrar las demás sesiones no apaga las alertas de este mismo dispositivo', async () => {
    const app = await appToken();
    const { token } = (await (await issue(app)).json()) as { token: string };
    await appTokenFrom('pc-oficina');
    await call(app, '/auth/sessions', 'DELETE');
    expect(await live(token)).toBe(true);
  });

  it('dos peticiones simultáneas dejan un solo token vivo', async () => {
    const app = await appToken();
    await Promise.all([issue(app), issue(app), issue(app)]);
    expect((await deviceSessions()).filter((x) => x.live)).toHaveLength(1);
  });
});

async function appTokenFrom(deviceId: string) {
  const res = await t.fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({
      username: 'mario.delgado',
      password: 'contraseña1',
      deviceId,
      deviceLabel: deviceId,
      platform: 'windows',
    }),
  });
  return ((await res.json()) as { token: string }).token;
}
