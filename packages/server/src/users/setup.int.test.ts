import { ManualClock } from '@impocaribe/shared';
import { RECOVERY_CODE_ALPHABET } from '@impocaribe/shared/validation';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { verifySecret } from '../auth/password.ts';

// T028 · RF-USR-05 (la primera Apoderada se crea solo desde la PC servidor), RF-REC-01 (8 códigos de un solo uso que se
// muestran una vez) y plan §6.2 (GET /setup/status y POST /setup, solo 127.0.0.1, una sola vez).
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');

const body = {
  fullName: 'Ilén Fernández Rojas',
  username: 'ilen.fernandez',
  nationalId: '84011905548',
  phone: '+53 52345678',
  password: 'contraseña1',
  confirm: 'contraseña1',
};
const post = (base: string, data: unknown = body) =>
  fetch(`${base}/setup`, { method: 'POST', headers: appHeaders(), body: JSON.stringify(data) });
const status = async () => (await fetch(`${t.base}/setup/status`, { headers: appHeaders() })).json();

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock);
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

beforeEach(async () => {
  await suite.admin.query(
    `TRUNCATE users CASCADE;
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;
     ALTER TABLE change_log DISABLE TRIGGER USER; TRUNCATE change_log; ALTER TABLE change_log ENABLE TRIGGER USER;`,
  );
});

describe('GET /setup/status', () => {
  it('sin ninguna Apoderada, el sistema no está configurado', async () => {
    expect(await status()).toEqual({ configured: false });
  });
});

describe('POST /setup (RF-USR-05)', () => {
  it('desde otro equipo de la red se rechaza y no crea nada', async () => {
    expect(t.lanBase).not.toBeNull();
    const res = await post(t.lanBase!);
    expect([res.status, await res.json()]).toEqual([
      403,
      { code: 'FORBIDDEN', message: 'El primer arranque solo se hace desde la propia PC servidor.' },
    ]);
    expect((await suite.admin.query('SELECT count(*)::int AS n FROM users')).rows).toEqual([{ n: 0 }]);
  });

  it('desde la PC servidor crea la primera Apoderada y devuelve sus 8 códigos una sola vez', async () => {
    const res = await post(t.base);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { user: Record<string, unknown>; recoveryCodes: string[] };
    expect(json.user).toEqual({
      id: json.user.id,
      username: 'ilen.fernandez',
      fullName: 'Ilén Fernández Rojas',
      nationalId: '84011905548',
      phone: '52345678',
      role: 'apoderada',
      active: true,
      mustChangePassword: false,
      rowVersion: 1,
    });
    const shape = new RegExp(`^[${RECOVERY_CODE_ALPHABET}]{4}-[${RECOVERY_CODE_ALPHABET}]{4}$`);
    expect([json.recoveryCodes.length, new Set(json.recoveryCodes).size]).toEqual([8, 8]);
    expect(json.recoveryCodes.filter((c) => !shape.test(c))).toEqual([]);
    expect(await status()).toEqual({ configured: true });
  });

  it('RF-REC-01: los códigos se guardan como hash, en un solo juego vigente', async () => {
    const json = (await (await post(t.base)).json()) as { recoveryCodes: string[] };
    const { rows } = await suite.admin.query(
      'SELECT code_hash, batch_id, used_at, invalidated_at FROM recovery_codes ORDER BY created_at, id',
    );
    expect([rows.length, new Set(rows.map((r) => r.batch_id)).size]).toEqual([8, 1]);
    expect(rows.every((r) => r.used_at === null && r.invalidated_at === null)).toBe(true);
    expect(rows.some((r) => (r.code_hash as string).includes(json.recoveryCodes[0]!))).toBe(false);
    const matches = await Promise.all(
      json.recoveryCodes.map(async (code) => {
        for (const r of rows) if (await verifySecret(r.code_hash as string, code)) return true;
        return false;
      }),
    );
    expect(matches).toEqual(Array(8).fill(true));
  });

  it('el rol siempre es Apoderada, aunque se pida otro', async () => {
    const res = await post(t.base, { ...body, role: 'lectura' });
    expect(((await res.json()) as { user: { role: string } }).user.role).toBe('apoderada');
  });

  it('solo una vez: con una Apoderada ya creada, se rechaza', async () => {
    await post(t.base);
    const res = await post(t.base, { ...body, username: 'otra.persona', nationalId: '85020306548' });
    expect([res.status, await res.json()]).toEqual([
      403,
      { code: 'FORBIDDEN', message: 'El sistema ya está configurado: la primera Apoderada ya existe.' },
    ]);
  });

  it('cinco intentos simultáneos crean una sola Apoderada', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(t.base, { ...body, username: `apoderada.${i}`, nationalId: `8401190554${i}` }).then((r) => r.status),
      ),
    );
    expect(results.sort()).toEqual([201, 403, 403, 403, 403]);
    expect((await suite.admin.query('SELECT count(*)::int AS n FROM users')).rows).toEqual([{ n: 1 }]);
  });

  it('valida con el esquema F-02 y devuelve el error de cada campo', async () => {
    const res = await post(t.base, { ...body, phone: '5234567', nationalId: '840119' });
    expect([res.status, await res.json()]).toEqual([
      400,
      {
        code: 'VALIDATION_ERROR',
        message: 'Hay 2 campos por corregir.',
        details: {
          fields: {
            nationalId: 'El carné debe tener 11 dígitos (tiene 6).',
            phone: 'El teléfono debe tener 8 dígitos (tiene 7).',
          },
        },
      },
    ]);
  });

  it('queda en la bitácora y en el registro de cambios, sin la contraseña ni los códigos', async () => {
    const json = (await (await post(t.base)).json()) as { user: { id: string }; recoveryCodes: string[] };
    const audit = await suite.admin.query('SELECT action, entity_type, entity_id, user_id, after, ok FROM audit_log');
    expect(audit.rows).toEqual([
      {
        action: 'setup.first_apoderada',
        entity_type: 'user',
        entity_id: json.user.id,
        user_id: json.user.id,
        after: { ...json.user },
        ok: true,
      },
    ]);
    const changes = await suite.admin.query('SELECT entity_type, entity_id, op, audience, payload FROM change_log');
    expect(changes.rows).toEqual([
      { entity_type: 'user', entity_id: json.user.id, op: 'upsert', audience: 'apoderada', payload: { ...json.user } },
    ]);
    const all = JSON.stringify([audit.rows, changes.rows]);
    expect([all.includes('contraseña1'), all.includes(json.recoveryCodes[0]!)]).toEqual([false, false]);
  });
});
