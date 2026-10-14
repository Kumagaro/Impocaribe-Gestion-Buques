import { ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { issueRecoveryCodes } from '../users/recovery-codes.ts';
import { createUser } from '../users/users.repo.ts';

// T030 · RF-REC-02 a 05 y plan §6.2 (POST /auth/recover, POST /auth/recovery-codes), ui-spec P-04: el error nunca dice
// cuál dato falló.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const DEVICE = { deviceId: 'tel-patio', deviceLabel: 'Teléfono de patio', platform: 'android' };
const FAILED = {
  code: 'RECOVERY_FAILED',
  message: 'Los datos no coinciden. Revíselos e inténtelo de nuevo.',
};
let userId: string;
let codes: string[];

const recover = (over: Record<string, string> = {}) =>
  fetch(`${t.base}/auth/recover`, {
    method: 'POST',
    headers: appHeaders({ 'X-Device-Id': 'tel-patio' }),
    body: JSON.stringify({
      username: 'mario.delgado',
      nationalId: '84011905548',
      phone: '+53 52345678',
      code: codes[0],
      password: 'clave-recuperada',
      confirm: 'clave-recuperada',
      ...over,
    }),
  });
const login = (password: string) =>
  fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({ username: 'mario.delgado', password, ...DEVICE }),
  });

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
    `TRUNCATE users CASCADE;
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;`,
  );
  const db = drizzle(suite.app);
  const user = await db.transaction((tx) =>
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
  );
  userId = user.id;
  codes = await db.transaction((tx) => issueRecoveryCodes(tx, clock, userId));
});

describe('RF-REC-02: con usuario, carné, teléfono y un código sin usar, define una contraseña nueva', () => {
  it('cambia la contraseña: la nueva entra y la vieja no', async () => {
    expect((await recover()).status).toBe(204);
    expect([(await login('contraseña1')).status, (await login('clave-recuperada')).status]).toEqual([403, 200]);
  });

  it('acepta el código en minúsculas y sin guion, y el teléfono con +53', async () => {
    const code = codes[1]!.toLowerCase().replace('-', '');
    expect((await recover({ code, phone: '+5352345678' })).status).toBe(204);
  });

  it('RF-AUT-04: cierra todas las sesiones abiertas y desbloquea el inicio de sesión', async () => {
    const token = ((await (await login('contraseña1')).json()) as { token: string }).token;
    for (let i = 0; i < 5; i++) await login('equivocada');
    expect((await recover()).status).toBe(204);
    const me = await fetch(`${t.base}/auth/me`, { headers: appHeaders({ Authorization: `Bearer ${token}` }) });
    expect([me.status, (await login('clave-recuperada')).status]).toEqual([401, 200]);
  });
});

describe('RF-REC-03: cada código vale una sola vez; un juego nuevo invalida el anterior', () => {
  it('un código ya usado se rechaza', async () => {
    expect((await recover()).status).toBe(204);
    const res = await recover({ password: 'otra-clave-1', confirm: 'otra-clave-1' });
    expect([res.status, await res.json()]).toEqual([422, { ...FAILED, details: { remainingAttempts: 2 } }]);
  });

  it('tras generar un juego nuevo, los códigos anteriores ya no valen', async () => {
    const token = ((await (await login('contraseña1')).json()) as { token: string }).token;
    const res = await fetch(`${t.base}/auth/recovery-codes`, {
      method: 'POST',
      headers: appHeaders({ Authorization: `Bearer ${token}` }),
    });
    const fresh = ((await res.json()) as { recoveryCodes: string[] }).recoveryCodes;
    expect([res.status, fresh.length, fresh.includes(codes[0]!)]).toEqual([201, 8, false]);
    expect((await recover()).status).toBe(422);
    expect((await recover({ code: fresh[0]! })).status).toBe(204);
  });
});

describe('P-04: el error nunca dice cuál dato falló', () => {
  it.each([
    ['usuario', { username: 'otro.usuario' }],
    ['carné', { nationalId: '85020306548' }],
    ['teléfono', { phone: '53456789' }],
    ['código', { code: 'AAAA-BBBB' }],
  ])('un %s que no coincide recibe el mismo mensaje', async (_name, over) => {
    const res = await recover(over);
    const json = (await res.json()) as { code: string; message: string };
    expect([res.status, json.code, json.message]).toEqual([422, FAILED.code, FAILED.message]);
  });

  it('un usuario desactivado no puede recuperar', async () => {
    await suite.admin.query('UPDATE users SET active = false WHERE id = $1', [userId]);
    expect((await recover()).status).toBe(422);
  });
});

describe('RF-REC-04: tras 3 intentos fallidos, la recuperación se bloquea 1 hora', () => {
  it('2 fallos dejan intentarlo; el 3.º bloquea, incluso con los datos correctos', async () => {
    await recover({ code: 'AAAA-BBBB' });
    const second = await recover({ code: 'AAAA-BBBB' });
    expect(await second.json()).toEqual({ ...FAILED, details: { remainingAttempts: 1 } });
    clock.set('2026-10-14T12:10:00.000Z');
    const third = await recover({ code: 'AAAA-BBBB' });
    expect([third.status, await third.json()]).toEqual([
      423,
      {
        code: 'RECOVERY_LOCKED',
        message:
          'La recuperación de este usuario quedó bloqueada 1 hora por 3 intentos fallidos. Podrá intentarlo de nuevo en 60 minutos.',
        details: { lockedUntil: '2026-10-14T13:10:00.000Z' },
      },
    ]);
    clock.set('2026-10-14T13:09:59.000Z');
    expect((await recover()).status).toBe(423);
    clock.set('2026-10-14T13:10:00.000Z');
    expect((await recover()).status).toBe(204);
  });

  it('un acierto vuelve a empezar la cuenta', async () => {
    await recover({ code: 'AAAA-BBBB' });
    await recover({ code: 'AAAA-BBBB' });
    expect((await recover()).status).toBe(204);
    const res = await recover({ code: 'AAAA-BBBB' });
    expect(await res.json()).toEqual({ ...FAILED, details: { remainingAttempts: 2 } });
  });

  it('fallos separados por más de una hora no se suman', async () => {
    await recover({ code: 'AAAA-BBBB' });
    await recover({ code: 'AAAA-BBBB' });
    clock.set('2026-10-14T13:00:01.000Z');
    const res = await recover({ code: 'AAAA-BBBB' });
    expect(await res.json()).toEqual({ ...FAILED, details: { remainingAttempts: 2 } });
  });
});

describe('RF-REC-05: toda recuperación, exitosa o fallida, queda en la bitácora', () => {
  it('registra el fallo y el éxito con el dispositivo, sin el código ni la contraseña', async () => {
    await recover({ code: 'AAAA-BBBB' });
    await recover();
    const { rows } = await suite.admin.query(
      "SELECT action, user_id, device_id, ok FROM audit_log WHERE action = 'auth.recover' ORDER BY id",
    );
    expect(rows).toEqual([
      { action: 'auth.recover', user_id: userId, device_id: 'tel-patio', ok: false },
      { action: 'auth.recover', user_id: userId, device_id: 'tel-patio', ok: true },
    ]);
    const all = JSON.stringify((await suite.admin.query('SELECT * FROM audit_log')).rows);
    expect([all.includes(codes[0]!), all.includes('clave-recuperada')]).toEqual([false, false]);
    const attempts = await suite.admin.query('SELECT success, device_id FROM recovery_attempts ORDER BY id');
    expect(attempts.rows).toEqual([
      { success: false, device_id: 'tel-patio' },
      { success: true, device_id: 'tel-patio' },
    ]);
  });
});
