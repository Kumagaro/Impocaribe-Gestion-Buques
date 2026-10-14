import { Controller, Get } from '@nestjs/common';
import { ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { Contract } from '../http/contract.ts';
import { createUser } from '../users/users.repo.ts';
import { revokeUserSessions } from './sessions.ts';

// T029 · RF-AUT-01 a 07 y 10, plan §6.2 (autenticación) y §9 (sesiones absolutas, token guardado como hash).

@Controller('prueba-roles')
class RolesProbeController {
  @Get('apoderada')
  @Contract({ roles: ['apoderada'] })
  onlyApoderada() {
    return { ok: true };
  }

  @Get('todos')
  @Contract({ roles: ['apoderada', 'operador', 'lectura'] })
  everyone() {
    return { ok: true };
  }

  @Get('sin-contrato')
  undeclared() {
    return { ok: true };
  }
}

let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const HOUR = 3600_000;
const DEVICE = { deviceId: 'pc-oficina', deviceLabel: 'PC OFICINA', platform: 'windows' };

async function addUser(username: string, role: 'apoderada' | 'operador' | 'lectura', nationalId: string) {
  const db = drizzle(suite.app);
  return db.transaction((tx) =>
    createUser(
      tx,
      clock,
      newUserSchema.parse({
        fullName: 'Persona de Prueba',
        username,
        nationalId,
        phone: '52345678',
        role,
        password: 'contraseña1',
        confirm: 'contraseña1',
      }),
    ),
  );
}

const login = (username: string, password: string, extra: Record<string, unknown> = {}) =>
  fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({ username, password, ...DEVICE, ...extra }),
  });
async function tokenOf(username: string, extra: Record<string, unknown> = {}) {
  return ((await (await login(username, 'contraseña1', extra)).json()) as { token: string }).token;
}
const authed = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${t.base}${path}`, { ...init, headers: appHeaders({ Authorization: `Bearer ${token}` }) });

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock, [RolesProbeController]);
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

beforeEach(async () => {
  clock.set('2026-10-14T12:00:00.000Z');
  await suite.admin.query(
    `TRUNCATE users CASCADE;
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;`,
  );
});

describe('POST /auth/login (RF-AUT-01, 02)', () => {
  it('con usuario y contraseña correctos devuelve el token, su vencimiento a 24 h y el usuario', async () => {
    const user = await addUser('mario.delgado', 'operador', '84011905548');
    const res = await login('Mario.Delgado ', 'contraseña1');
    const json = (await res.json()) as { token: string; expiresAt: string; user: unknown };
    expect([res.status, json.expiresAt, json.user]).toEqual([200, '2026-10-15T12:00:00.000Z', user]);
    expect(json.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('con "Mantener sesión" dura 30 días', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const json = (await (await login('mario.delgado', 'contraseña1', { keepSignedIn: true })).json()) as {
      expiresAt: string;
    };
    expect(json.expiresAt).toBe('2026-11-13T12:00:00.000Z');
  });

  it('el servidor guarda solo el hash del token, con el dispositivo de la sesión', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const token = await tokenOf('mario.delgado');
    const { rows } = await suite.admin.query(
      'SELECT token_hash, kind, device_id, device_label, platform, keep_signed_in FROM sessions',
    );
    expect(rows).toEqual([
      {
        token_hash: rows[0].token_hash,
        kind: 'app',
        device_id: 'pc-oficina',
        device_label: 'PC OFICINA',
        platform: 'windows',
        keep_signed_in: false,
      },
    ]);
    expect([rows[0].token_hash === token, (rows[0].token_hash as string).length]).toEqual([false, 64]);
  });

  it('una contraseña equivocada no entra y dice cuántos intentos quedan', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const res = await login('mario.delgado', 'otra-clave');
    expect([res.status, await res.json()]).toEqual([
      403,
      { code: 'FORBIDDEN', message: 'Usuario o contraseña incorrectos.', details: { remainingAttempts: 4 } },
    ]);
  });

  it('un usuario que no existe recibe el mismo mensaje', async () => {
    const res = await login('nadie', 'contraseña1');
    expect([res.status, await res.json()]).toEqual([
      403,
      { code: 'FORBIDDEN', message: 'Usuario o contraseña incorrectos.' },
    ]);
  });

  it('RF-AUT-01: un usuario desactivado no puede entrar', async () => {
    const user = await addUser('mario.delgado', 'operador', '84011905548');
    await suite.admin.query('UPDATE users SET active = false WHERE id = $1', [user.id]);
    const res = await login('mario.delgado', 'contraseña1');
    expect([res.status, await res.json()]).toEqual([
      403,
      { code: 'FORBIDDEN', message: 'Este usuario está desactivado. Consulte a una Apoderada.' },
    ]);
  });

  it('valida el cuerpo con el esquema compartido', async () => {
    const res = await login('', '');
    expect([res.status, ((await res.json()) as { details: unknown }).details]).toEqual([
      400,
      { fields: { username: 'Escriba el usuario.', password: 'Escriba la contraseña.' } },
    ]);
  });
});

describe('RF-AUT-05: 5 intentos fallidos seguidos bloquean 15 minutos', () => {
  it('el 4.º fallo no bloquea: la contraseña correcta entra y reinicia el contador', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    for (let i = 0; i < 4; i++) await login('mario.delgado', 'otra-clave');
    expect((await login('mario.delgado', 'contraseña1')).status).toBe(200);
    const fail = await login('mario.delgado', 'otra-clave');
    expect(((await fail.json()) as { details: unknown }).details).toEqual({ remainingAttempts: 4 });
  });

  it('el 5.º fallo bloquea: ni la contraseña correcta entra hasta pasados 15 minutos', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    for (let i = 0; i < 4; i++) await login('mario.delgado', 'otra-clave');
    const fifth = await login('mario.delgado', 'otra-clave');
    expect([fifth.status, await fifth.json()]).toEqual([
      423,
      {
        code: 'ACCOUNT_LOCKED',
        message: 'Cuenta bloqueada por 5 intentos fallidos. Podrá intentarlo de nuevo en 15 minutos.',
        details: { lockedUntil: '2026-10-14T12:15:00.000Z' },
      },
    ]);
    clock.set('2026-10-14T12:14:59.000Z');
    const locked = await login('mario.delgado', 'contraseña1');
    expect([locked.status, ((await locked.json()) as { message: string }).message]).toEqual([
      423,
      'Cuenta bloqueada por 5 intentos fallidos. Podrá intentarlo de nuevo en 1 minuto.',
    ]);
    clock.set('2026-10-14T12:15:00.000Z');
    expect((await login('mario.delgado', 'contraseña1')).status).toBe(200);
  });

  it('el bloqueo queda en la bitácora', async () => {
    const user = await addUser('mario.delgado', 'operador', '84011905548');
    for (let i = 0; i < 5; i++) await login('mario.delgado', 'otra-clave');
    const { rows } = await suite.admin.query(
      "SELECT action, user_id, ok FROM audit_log WHERE action IN ('auth.login', 'auth.locked') ORDER BY id",
    );
    expect(rows).toEqual([
      ...Array(4).fill({ action: 'auth.login', user_id: user.id, ok: false }),
      { action: 'auth.locked', user_id: user.id, ok: true },
    ]);
  });
});

describe('RF-AUT-02: la sesión vence a las 24 h exactas, sin importar la actividad', () => {
  it('a las 23:59:59 con actividad sigue; a las 24:00:00 exige iniciar sesión', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const token = await tokenOf('mario.delgado');
    for (const at of ['2026-10-14T18:00:00.000Z', '2026-10-15T06:00:00.000Z', '2026-10-15T11:59:59.000Z']) {
      clock.set(at);
      expect((await authed(token, '/auth/me')).status).toBe(200);
    }
    clock.set('2026-10-15T12:00:00.000Z');
    const res = await authed(token, '/auth/me');
    expect([res.status, await res.json()]).toEqual([
      401,
      { code: 'SESSION_EXPIRED', message: 'La sesión venció. Inicie sesión de nuevo.' },
    ]);
  });

  it('con "Mantener sesión", a los 30 días exactos', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const token = await tokenOf('mario.delgado', { keepSignedIn: true });
    clock.set(new Date(Date.parse('2026-10-14T12:00:00.000Z') + 30 * 24 * HOUR - 1000).toISOString());
    expect((await authed(token, '/auth/me')).status).toBe(200);
    clock.set('2026-11-13T12:00:00.000Z');
    expect((await authed(token, '/auth/me')).status).toBe(401);
  });
});

describe('guarda de sesión y roles', () => {
  it('sin token, o con uno desconocido, pide iniciar sesión', async () => {
    const none = await fetch(`${t.base}/auth/me`, { headers: appHeaders() });
    const bad = await authed('x'.repeat(43), '/auth/me');
    expect([none.status, bad.status, ((await bad.json()) as { code: string }).code]).toEqual([
      401,
      401,
      'SESSION_EXPIRED',
    ]);
  });

  it('el rol de la ruta se aplica en el servidor (Const. art. X.5)', async () => {
    await addUser('ana.apoderada', 'apoderada', '84011905548');
    await addUser('oscar.lectura', 'lectura', '85020306548');
    const a = await tokenOf('ana.apoderada');
    const l = await tokenOf('oscar.lectura');
    const results = await Promise.all([
      authed(a, '/prueba-roles/apoderada'),
      authed(l, '/prueba-roles/apoderada'),
      authed(l, '/prueba-roles/todos'),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 403, 200]);
    expect(await results[1]!.json()).toEqual({ code: 'FORBIDDEN', message: 'Su rol no permite esta acción.' });
  });

  it('una ruta que no declara su contrato no se sirve a nadie', async () => {
    await addUser('ana.apoderada', 'apoderada', '84011905548');
    expect((await authed(await tokenOf('ana.apoderada'), '/prueba-roles/sin-contrato')).status).toBe(403);
  });

  it('RF-AUT-04: desactivar al usuario invalida su sesión al instante', async () => {
    const user = await addUser('mario.delgado', 'operador', '84011905548');
    const token = await tokenOf('mario.delgado');
    await suite.admin.query('UPDATE users SET active = false WHERE id = $1', [user.id]);
    expect((await authed(token, '/auth/me')).status).toBe(401);
  });

  it('RF-AUT-10: una sesión revocada (cambio de rol, contraseña o desactivación) deja de valer', async () => {
    const user = await addUser('mario.delgado', 'operador', '84011905548');
    const token = await tokenOf('mario.delgado');
    const db = drizzle(suite.app);
    await db.transaction((tx) => revokeUserSessions(tx, clock, user.id));
    expect((await authed(token, '/auth/me')).status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('devuelve el usuario y las acciones que su rol permite', async () => {
    const user = await addUser('oscar.lectura', 'lectura', '84011905548');
    const res = await authed(await tokenOf('oscar.lectura'), '/auth/me');
    expect(await res.json()).toEqual({ user, permissions: ['view'] });
  });
});

describe('RF-AUT-03 y 07: sesiones en varios dispositivos, gestionadas desde el perfil', () => {
  it('lista las propias sesiones vigentes y marca la actual', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const pc = await tokenOf('mario.delgado');
    clock.set('2026-10-14T12:05:00.000Z');
    await tokenOf('mario.delgado', { deviceId: 'tel-patio', deviceLabel: 'Teléfono de patio', platform: 'android' });
    const list = (await (await authed(pc, '/auth/sessions')).json()) as Record<string, unknown>[];
    expect(list.map((s) => ({ ...s, id: undefined }))).toEqual([
      {
        deviceLabel: 'Teléfono de patio',
        platform: 'android',
        createdAt: '2026-10-14T12:05:00.000Z',
        expiresAt: '2026-10-15T12:05:00.000Z',
        lastSeenAt: '2026-10-14T12:05:00.000Z',
        current: false,
      },
      {
        deviceLabel: 'PC OFICINA',
        platform: 'windows',
        createdAt: '2026-10-14T12:00:00.000Z',
        expiresAt: '2026-10-15T12:00:00.000Z',
        lastSeenAt: '2026-10-14T12:05:00.000Z',
        current: true,
      },
    ]);
  });

  it('cerrar otra sesión la invalida en el servidor; una ajena no se puede cerrar', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    await addUser('yanet.ruiz', 'operador', '85020306548');
    const pc = await tokenOf('mario.delgado');
    const phone = await tokenOf('mario.delgado', { deviceId: 'tel', deviceLabel: 'Tel', platform: 'android' });
    const other = await tokenOf('yanet.ruiz');
    const list = (await (await authed(pc, '/auth/sessions')).json()) as { id: string; current: boolean }[];
    const phoneId = list.find((s) => !s.current)!.id;
    const foreign = await authed(other, `/auth/sessions/${phoneId}`, { method: 'DELETE' });
    expect(foreign.status).toBe(404);
    expect((await authed(pc, `/auth/sessions/${phoneId}`, { method: 'DELETE' })).status).toBe(204);
    expect([(await authed(phone, '/auth/me')).status, (await authed(pc, '/auth/me')).status]).toEqual([401, 200]);
  });

  it('cerrar las demás sesiones deja solo la actual', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const pc = await tokenOf('mario.delgado');
    const a = await tokenOf('mario.delgado', { deviceId: 'a', deviceLabel: 'A', platform: 'android' });
    const b = await tokenOf('mario.delgado', { deviceId: 'b', deviceLabel: 'B', platform: 'android' });
    expect((await authed(pc, '/auth/sessions', { method: 'DELETE' })).status).toBe(204);
    const statuses = await Promise.all([pc, a, b].map(async (tk) => (await authed(tk, '/auth/me')).status));
    expect(statuses).toEqual([200, 401, 401]);
  });

  it('POST /auth/logout cierra la sesión actual', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const token = await tokenOf('mario.delgado');
    expect((await authed(token, '/auth/logout', { method: 'POST' })).status).toBe(204);
    expect((await authed(token, '/auth/me')).status).toBe(401);
  });
});

describe('RF-AUT-04: cambiar la contraseña cierra las demás sesiones', () => {
  const change = (token: string, body: unknown) =>
    authed(token, '/auth/change-password', { method: 'POST', body: JSON.stringify(body) });

  it('con la actual correcta la cambia, cierra las demás sesiones y mantiene esta', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const pc = await tokenOf('mario.delgado');
    const phone = await tokenOf('mario.delgado', { deviceId: 'tel', deviceLabel: 'Tel', platform: 'android' });
    const res = await change(pc, { current: 'contraseña1', password: 'clave-nueva', confirm: 'clave-nueva' });
    expect(res.status).toBe(204);
    expect([(await authed(pc, '/auth/me')).status, (await authed(phone, '/auth/me')).status]).toEqual([200, 401]);
    expect([
      (await login('mario.delgado', 'contraseña1')).status,
      (await login('mario.delgado', 'clave-nueva')).status,
    ]).toEqual([403, 200]);
  });

  it('con la actual equivocada no cambia nada y lo dice en su campo', async () => {
    await addUser('mario.delgado', 'operador', '84011905548');
    const pc = await tokenOf('mario.delgado');
    const res = await change(pc, { current: 'equivocada', password: 'clave-nueva', confirm: 'clave-nueva' });
    expect([res.status, await res.json()]).toEqual([
      400,
      {
        code: 'VALIDATION_ERROR',
        message: 'Hay 1 campo por corregir.',
        details: { fields: { current: 'La contraseña actual no es correcta.' } },
      },
    ]);
  });
});

describe('RF-REC-06: quien debe cambiar la contraseña no hace nada más', () => {
  it('solo puede ver su perfil, cambiar la contraseña o salir', async () => {
    const user = await addUser('mario.delgado', 'operador', '84011905548');
    await suite.admin.query('UPDATE users SET must_change_password = true WHERE id = $1', [user.id]);
    const token = await tokenOf('mario.delgado');
    const [me, other] = await Promise.all([authed(token, '/auth/me'), authed(token, '/prueba-roles/todos')]);
    expect([me.status, other.status, await other.json()]).toEqual([
      200,
      403,
      { code: 'FORBIDDEN', message: 'Debe cambiar su contraseña antes de continuar.' },
    ]);
    const changed = await authed(token, '/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current: 'contraseña1', password: 'clave-nueva', confirm: 'clave-nueva' }),
    });
    expect([changed.status, (await authed(token, '/prueba-roles/todos')).status]).toEqual([204, 200]);
  });
});
