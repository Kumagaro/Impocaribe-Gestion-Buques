import { ManualClock } from '@impocaribe/shared';
import { DEFAULT_LEGAL_NOTICE, newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { hashSecret, verifySecret } from '../auth/password.ts';
import { createUser } from '../users/users.repo.ts';

// T052 · RF-CFG-01, 02 y 04, plan §4.2 y §6.2 (Configuración): solo Apoderadas; cada cambio, en la bitácora.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const tokens: Record<string, string> = {};
const usb = mkdtempSync(join(tmpdir(), 'impocaribe-usb-'));

const people = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
] as const;

const DEFAULTS = {
  maxLoadingDaysAhead: 7,
  workdayStart: '07:00',
  workdayEnd: '19:00',
  dailyBackupHour: '20:00',
  externalBackupDir: null,
  networkSetup: 'router',
  deadlineLegalNotice: DEFAULT_LEGAL_NOTICE,
  rowVersion: 1,
};
const EDIT = {
  maxLoadingDaysAhead: 3,
  workdayStart: '08:00',
  workdayEnd: '17:30',
  dailyBackupHour: '21:00',
  externalBackupDir: usb,
  networkSetup: 'hotspot',
  deadlineLegalNotice: DEFAULT_LEGAL_NOTICE.replace('Verifique', 'Compruebe'),
  expectedVersion: 1,
};

const call = (who: string, path: string, init: RequestInit = {}) =>
  t.fetch(`${t.base}${path}`, {
    ...init,
    headers: appHeaders({ Authorization: `Bearer ${tokens[who]}`, 'Idempotency-Key': randomUUID() }),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, undefined> });
const patch = (body: unknown) => call('ana', '/settings', { method: 'PATCH', body: JSON.stringify(body) });
const changeCode = (body: unknown) =>
  call('ana', '/settings/installation-code', { method: 'POST', body: JSON.stringify(body) });
const codeHash = async () =>
  (await suite.admin.query('SELECT installation_code_hash AS h FROM system_settings')).rows[0].h as string | null;
const audit = async (action: string) =>
  (await suite.admin.query('SELECT ok, before, after FROM audit_log WHERE action = $1 ORDER BY id', [action])).rows;

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
    `TRUNCATE users, files CASCADE; TRUNCATE idempotency_keys;
     INSERT INTO system_settings (id) VALUES (1);
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;`,
  );
  const db = drizzle(suite.app);
  for (const [username, fullName, role, nationalId] of people) {
    await db.transaction((tx) =>
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
    const res = await t.fetch(`${t.base}/auth/login`, {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        username,
        password: 'contraseña1',
        deviceId: `pc-${username}`,
        deviceLabel: username,
        platform: 'windows',
      }),
    });
    tokens[username] = ((await res.json()) as { token: string }).token;
  }
});

describe('RF-CFG-01 y 02: parámetros', () => {
  it('solo una Apoderada los ve; al principio, los valores por defecto', async () => {
    expect((await call('mario', '/settings')).status).toBe(403);
    expect(await json(await call('ana', '/settings'))).toEqual({ status: 200, body: DEFAULTS });
  });

  it('cambiarlos guarda los nuevos valores y deja en la bitácora el anterior y el nuevo', async () => {
    expect((await call('mario', '/settings', { method: 'PATCH', body: JSON.stringify(EDIT) })).status).toBe(403);
    const values = { ...EDIT, expectedVersion: undefined };
    expect(await json(await patch(EDIT))).toEqual({ status: 200, body: { ...values, rowVersion: 2 } });
    expect(await json(await call('ana', '/settings'))).toEqual({ status: 200, body: { ...values, rowVersion: 2 } });
    const [entry] = await audit('settings.edit');
    expect(entry.before).toEqual({ ...DEFAULTS, rowVersion: undefined });
    expect(entry.after).toEqual(values);
  });

  it('con la memoria USB desconectada se pueden cambiar los demás parámetros (la carpeta no se comprueba si no cambia)', async () => {
    const unplugged = join(usb, 'usb-desconectada');
    await suite.admin.query('UPDATE system_settings SET external_backup_dir = $1', [unplugged]);
    const res = await json(await patch({ ...EDIT, externalBackupDir: unplugged, maxLoadingDaysAhead: 4 }));
    expect([res.status, res.body.maxLoadingDaysAhead, res.body.externalBackupDir]).toEqual([200, 4, unplugged]);
  });

  it('con la versión vieja responde STALE_RECORD', async () => {
    await patch(EDIT);
    const res = await json(await patch({ ...EDIT, maxLoadingDaysAhead: 5 }));
    expect([res.status, res.body.code, res.body.details]).toEqual([409, 'STALE_RECORD', { currentVersion: 2 }]);
  });

  it('valida con F-06', async () => {
    const res = await json(await patch({ ...EDIT, maxLoadingDaysAhead: 31, workdayEnd: '07:00' }));
    expect([res.status, res.body.details]).toEqual([
      400,
      {
        fields: {
          maxLoadingDaysAhead: 'Escriba un número entero de 0 a 30.',
          workdayEnd: 'El fin de la jornada debe ser posterior al inicio (07:00 a 19:00, por ejemplo).',
        },
      },
    ]);
  });

  it.each([
    [
      'no existe',
      () => join(usb, 'no-existe'),
      'La carpeta no existe en la PC servidor. Conecte la memoria USB o elija otra.',
    ],
    [
      'es un archivo',
      () => {
        const file = join(usb, 'archivo.txt');
        writeFileSync(file, 'x');
        return file;
      },
      'La ruta es un archivo, no una carpeta.',
    ],
  ])('la carpeta externa la comprueba el servidor: %s', async (_, dir, message) => {
    const res = await json(await patch({ ...EDIT, externalBackupDir: dir() }));
    expect([res.status, res.body.code, res.body.details]).toEqual([
      400,
      'VALIDATION_ERROR',
      { fields: { externalBackupDir: message } },
    ]);
    expect((await json(await call('ana', '/settings'))).body.rowVersion).toBe(1);
  });
});

describe('RF-CFG-04: código de instalación', () => {
  const change = { currentCode: 'ABCD-EFGH-JKMN', newCode: 'K7QM-3XTP-R2HW', confirm: 'K7QM-3XTP-R2HW' };

  it('sin código guardado aún, lo explica y no cambia nada', async () => {
    const res = await json(await changeCode(change));
    expect([res.status, res.body.code, res.body.message]).toEqual([
      403,
      'INSTALL_CODE_INVALID',
      'Este servidor aún no tiene código de instalación: lo guarda el ayudante de instalación al crear el servidor.',
    ]);
    expect(await codeHash()).toBeNull();
  });

  it('con el actual incorrecto se rechaza y queda en la bitácora como fallido, sin los códigos', async () => {
    await suite.admin.query('UPDATE system_settings SET installation_code_hash = $1', [
      await hashSecret('ABCD-EFGH-JKMN'),
    ]);
    const res = await json(await changeCode({ ...change, currentCode: 'ABCD-EFGH-JKMP' }));
    expect([res.status, res.body.code, res.body.message]).toEqual([
      403,
      'INSTALL_CODE_INVALID',
      'El código de instalación actual no es correcto.',
    ]);
    expect(await audit('settings.installation_code')).toEqual([
      {
        ok: false,
        before: null,
        after: { code: 'INSTALL_CODE_INVALID', message: 'El código de instalación actual no es correcto.' },
      },
    ]);
  });

  it('los códigos no entran en la huella de idempotencia: repetir con otro código es la misma petición', async () => {
    await suite.admin.query('UPDATE system_settings SET installation_code_hash = $1', [
      await hashSecret('ABCD-EFGH-JKMN'),
    ]);
    const key = randomUUID();
    const send = (currentCode: string) =>
      t.fetch(`${t.base}/settings/installation-code`, {
        method: 'POST',
        headers: appHeaders({ Authorization: `Bearer ${tokens.ana}`, 'Idempotency-Key': key }),
        body: JSON.stringify({ ...change, currentCode }),
      });
    expect((await send('ABCD-EFGH-JKMN')).status).toBe(204);
    // Con IDEMPOTENCY_MISMATCH sabríamos que el código cuenta en la huella guardada (se podría adivinar sin sal).
    expect((await send('ZZZZ-ZZZZ-ZZZZ')).status).toBe(204);
  });

  it('con el actual correcto lo cambia: el nuevo vale y el viejo ya no', async () => {
    await suite.admin.query('UPDATE system_settings SET installation_code_hash = $1', [
      await hashSecret('ABCD-EFGH-JKMN'),
    ]);
    expect(
      (await call('mario', '/settings/installation-code', { method: 'POST', body: JSON.stringify(change) })).status,
    ).toBe(403);
    // Admite el código en minúsculas y sin guiones, como lo escribiría alguien a mano.
    expect((await changeCode({ ...change, currentCode: 'abcdefghjkmn' })).status).toBe(204);
    const hash = (await codeHash())!;
    expect(await verifySecret(hash, 'K7QM-3XTP-R2HW')).toBe(true);
    expect(await verifySecret(hash, 'ABCD-EFGH-JKMN')).toBe(false);
    expect(await audit('settings.installation_code')).toEqual([{ ok: true, before: null, after: null }]);
  });
});
