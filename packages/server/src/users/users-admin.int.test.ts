import { ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from './users.repo.ts';

// T031 · RF-USR-02 a 04, RF-REC-06, RF-AUT-04 y 10, plan §6.2 (Usuarios: solo Apoderada).
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

const people = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
  ['oscar', 'Oscar Lectura', 'lectura', '86030406548'],
] as const;

async function login(username: string, password = 'contraseña1', deviceId = `pc-${username}`) {
  const res = await t.fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({ username, password, deviceId, deviceLabel: deviceId, platform: 'windows' }),
  });
  return { status: res.status, json: (await res.json()) as { token: string; user: { mustChangePassword: boolean } } };
}
const call = (who: string, path: string, init: RequestInit = {}, extra: Record<string, string> = {}) =>
  t.fetch(`${t.base}${path}`, { ...init, headers: appHeaders({ Authorization: `Bearer ${tokens[who]}`, ...extra }) });
const me = async (token: string) =>
  (await t.fetch(`${t.base}/auth/me`, { headers: appHeaders({ Authorization: `Bearer ${token}` }) })).status;
const version = async (id: string) =>
  (await suite.admin.query('SELECT row_version FROM users WHERE id = $1', [id])).rows[0].row_version as number;

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
  await suite.admin.query(
    `TRUNCATE users CASCADE; TRUNCATE idempotency_keys;
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;
     ALTER TABLE change_log DISABLE TRIGGER USER; TRUNCATE change_log; ALTER TABLE change_log ENABLE TRIGGER USER;`,
  );
  const db = drizzle(suite.app);
  for (const [username, fullName, role, nationalId] of people) {
    const user = await db.transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName,
          username,
          nationalId,
          phone: '52345678',
          role,
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    );
    ids[username] = user.id;
    tokens[username] = (await login(username)).json.token;
  }
});

const newUser = {
  fullName: 'Yanet Ruiz Castro',
  username: 'yanet.ruiz',
  nationalId: '87040506548',
  phone: '+53 53456789',
  role: 'operador',
  password: 'temporal-1',
  confirm: 'temporal-1',
};

describe('RF-USR-02: solo una Apoderada gestiona usuarios', () => {
  it.each(['mario', 'oscar'])('%s recibe FORBIDDEN en la lista y en el alta', async (who) => {
    const [list, create] = await Promise.all([
      call(who, '/users'),
      call(who, '/users', { method: 'POST', body: JSON.stringify(newUser) }),
    ]);
    expect([list.status, create.status]).toEqual([403, 403]);
    expect(
      (await suite.admin.query("SELECT count(*)::int AS n FROM users WHERE username = 'yanet.ruiz'")).rows,
    ).toEqual([{ n: 0 }]);
  });
});

describe('GET /users (P-21: rol, estado y último acceso)', () => {
  it('lista a todos, ordenados por nombre, con su último acceso', async () => {
    clock.set('2026-10-14T13:00:00.000Z');
    await me(tokens.oscar!);
    const list = (await (await call('ana', '/users')).json()) as {
      username: string;
      role: string;
      active: boolean;
      lastAccessAt: string | null;
    }[];
    expect(list.map((u) => [u.username, u.role, u.active, u.lastAccessAt])).toEqual([
      ['ana', 'apoderada', true, '2026-10-14T13:00:00.000Z'],
      ['mario', 'operador', true, '2026-10-14T12:00:00.000Z'],
      ['oscar', 'lectura', true, '2026-10-14T13:00:00.000Z'],
    ]);
  });
});

describe('POST /users: alta con sus códigos de recuperación (RF-REC-01)', () => {
  it('crea el usuario con el teléfono sin +53 y devuelve sus 8 códigos una sola vez', async () => {
    const res = await call('ana', '/users', { method: 'POST', body: JSON.stringify(newUser) });
    const json = (await res.json()) as { user: { id: string; phone: string; role: string }; recoveryCodes: string[] };
    expect([res.status, json.user.phone, json.user.role, json.recoveryCodes.length]).toEqual([
      201,
      '53456789',
      'operador',
      8,
    ]);
    expect((await login('yanet.ruiz', 'temporal-1')).status).toBe(200);
    const audit = await suite.admin.query("SELECT user_id, entity_id, ok FROM audit_log WHERE action = 'user.create'");
    expect(audit.rows).toEqual([{ user_id: ids.ana, entity_id: json.user.id, ok: true }]);
    // Plan §4.4: el alta y el inicio de sesión replican el directorio para todos y la ficha para las Apoderadas.
    const changes = await suite.admin.query(
      'SELECT entity_type, audience FROM change_log WHERE entity_id = $1 ORDER BY seq',
      [json.user.id],
    );
    expect(changes.rows).toEqual([
      { entity_type: 'user_directory', audience: 'all' },
      { entity_type: 'user_admin', audience: 'apoderada' },
      { entity_type: 'user_directory', audience: 'all' },
      { entity_type: 'user_admin', audience: 'apoderada' },
    ]);
  });

  it('un carné repetido se rechaza en su campo', async () => {
    const res = await call('ana', '/users', {
      method: 'POST',
      body: JSON.stringify({ ...newUser, nationalId: '85020306548' }),
    });
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([409, 'DUPLICATE_NATIONAL_ID']);
  });
});

describe('PATCH /users/:id', () => {
  const edit = (who: string, id: string, body: Record<string, unknown>) =>
    call(who, `/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const mario = (over: Record<string, unknown> = {}) => ({
    fullName: 'Mario Operador',
    username: 'mario',
    nationalId: '85020306548',
    phone: '52345678',
    role: 'operador',
    expectedVersion: 1,
    ...over,
  });

  it('RF-AUT-10: cambiar el rol cierra todas sus sesiones', async () => {
    const res = await edit('ana', ids.mario!, mario({ role: 'lectura' }));
    expect([res.status, ((await res.json()) as { role: string; rowVersion: number }).role]).toEqual([200, 'lectura']);
    expect(await me(tokens.mario!)).toBe(401);
  });

  it('la respuesta y el registro de cambios nunca llevan el hash ni los contadores de seguridad', async () => {
    const res = await edit('ana', ids.mario!, mario({ phone: '59876543' }));
    const { rows } = await suite.admin.query(
      "SELECT payload FROM change_log WHERE entity_type IN ('user_directory', 'user_admin')",
    );
    const keys = [Object.keys((await res.json()) as object), ...rows.map((r) => Object.keys(r.payload as object))];
    expect(keys.flat().filter((k) => /password|failed|locked/i.test(k) && k !== 'mustChangePassword')).toEqual([]);
  });

  it('cambiar otros datos sin tocar el rol no cierra sus sesiones', async () => {
    const res = await edit('ana', ids.mario!, mario({ phone: '+53 59876543' }));
    expect([res.status, ((await res.json()) as { phone: string }).phone, await me(tokens.mario!)]).toEqual([
      200,
      '59876543',
      200,
    ]);
  });

  it('DT-23: con una versión vieja responde STALE_RECORD sin cambiar nada', async () => {
    await edit('ana', ids.mario!, mario({ phone: '59876543' }));
    const res = await edit('ana', ids.mario!, mario({ phone: '51112222' }));
    expect([res.status, await res.json()]).toEqual([
      409,
      {
        code: 'STALE_RECORD',
        message: 'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
        details: { currentVersion: 2 },
      },
    ]);
  });

  it('RF-USR-04: no se puede degradar a la última Apoderada activa', async () => {
    const res = await edit('ana', ids.ana!, {
      fullName: 'Ana Apoderada',
      username: 'ana',
      nationalId: '84011905548',
      phone: '52345678',
      role: 'operador',
      expectedVersion: 1,
    });
    expect([res.status, await res.json()]).toEqual([
      422,
      {
        code: 'LAST_APODERADA',
        message:
          'No se puede desactivar ni cambiar de rol a la última Apoderada activa. Cree o active otra Apoderada antes.',
      },
    ]);
  });
});

describe('activar y desactivar (RF-USR-03, RF-AUT-04)', () => {
  it('desactivar cierra sus sesiones e impide entrar; activar lo deja entrar de nuevo', async () => {
    expect((await call('ana', `/users/${ids.mario}/deactivate`, { method: 'POST' })).status).toBe(200);
    expect([await me(tokens.mario!), (await login('mario')).status]).toEqual([401, 403]);
    const res = await call('ana', `/users/${ids.mario}/activate`, { method: 'POST' });
    expect([res.status, ((await res.json()) as { active: boolean }).active, (await login('mario')).status]).toEqual([
      200,
      true,
      200,
    ]);
    // Reactivar no revive las sesiones que la desactivación cerró.
    expect(await me(tokens.mario!)).toBe(401);
  });

  it('RF-USR-04: la última Apoderada activa no se puede desactivar', async () => {
    const res = await call('ana', `/users/${ids.ana}/deactivate`, { method: 'POST' });
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([422, 'LAST_APODERADA']);
  });

  it('con dos Apoderadas que se desactivan a la vez, queda una activa', async () => {
    await call('ana', `/users/${ids.mario}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'Mario Operador',
        username: 'mario',
        nationalId: '85020306548',
        phone: '52345678',
        role: 'apoderada',
        expectedVersion: 1,
      }),
    });
    tokens.mario = (await login('mario')).json.token;
    const results = await Promise.all([
      call('ana', `/users/${ids.mario}/deactivate`, { method: 'POST' }),
      call('mario', `/users/${ids.ana}/deactivate`, { method: 'POST' }),
    ]);
    // Una se aplica. La otra se rechaza: por la regla (422) si llegan a la vez, o porque su sesión ya se cerró (401).
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([401, 422]).toContain(statuses[1]);
    const { rows } = await suite.admin.query(
      "SELECT count(*)::int AS n FROM users WHERE role = 'apoderada' AND active",
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('D15: el mismo intento enviado dos veces tiene un solo efecto y la misma respuesta', async () => {
    const key = { 'Idempotency-Key': '0192a3b4-0000-7000-8000-00000000d001' };
    const first = await call('ana', `/users/${ids.mario}/deactivate`, { method: 'POST' }, key);
    const second = await call('ana', `/users/${ids.mario}/deactivate`, { method: 'POST' }, key);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await second.json()).toEqual(await first.json());
    const audit = await suite.admin.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'user.deactivate'");
    expect(audit.rows).toEqual([{ n: 1 }]);
    expect(await version(ids.mario!)).toBe(2);
  });
});

describe('RF-REC-06: restablecer la contraseña de un usuario', () => {
  it('la temporal entra, cierra sus sesiones y obliga a cambiarla en el próximo ingreso', async () => {
    const res = await call('ana', `/users/${ids.mario}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: 'temporal-9', confirm: 'temporal-9' }),
    });
    expect(res.status).toBe(200);
    expect(await me(tokens.mario!)).toBe(401);
    const second = await login('mario', 'temporal-9');
    expect([second.status, second.json.user.mustChangePassword]).toEqual([200, true]);
    const audit = await suite.admin.query(
      "SELECT user_id, entity_id FROM audit_log WHERE action = 'user.reset_password'",
    );
    expect(audit.rows).toEqual([{ user_id: ids.ana, entity_id: ids.mario }]);
  });

  it('valida la temporal con las mismas reglas (al menos 8 caracteres)', async () => {
    const res = await call('ana', `/users/${ids.mario}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: 'corta', confirm: 'corta' }),
    });
    expect([res.status, ((await res.json()) as { details: unknown }).details]).toEqual([
      400,
      { fields: { password: 'La contraseña debe tener al menos 8 caracteres (tiene 5).' } },
    ]);
  });
});

describe('un usuario inexistente', () => {
  it('responde NOT_FOUND', async () => {
    const res = await call('ana', '/users/0192a3b4-0000-7000-8000-0000000000ff/deactivate', { method: 'POST' });
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([404, 'NOT_FOUND']);
  });
});
