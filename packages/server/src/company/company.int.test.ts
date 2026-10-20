import { ManualClock } from '@impocaribe/shared';
import { jpeg, png } from '@impocaribe/shared/testing';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';

// T050 y T051 · RF-EMP-01, 02, 05 y 06, plan §4.2 y §6.2 (Empresa): datos de la empresa, firma y cuño oficiales.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

const people = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
  ['oscar', 'Oscar Lectura', 'lectura', '86030406548'],
] as const;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
/** Una imagen de firma "real" de algo más de 1 MB: la cabecera PNG y relleno. */
const bigPng = () => {
  const bytes = new Uint8Array(1_500_000);
  bytes.set(png(900, 300));
  return bytes;
};
const SIGNATURE = { representativeName: 'Ilén Fernández Rojas', credentialNo: '00123', position: 'Directora' };

const call = (who: string, path: string, init: RequestInit = {}) =>
  t.fetch(`${t.base}${path}`, {
    ...init,
    headers: appHeaders({ Authorization: `Bearer ${tokens[who]}`, 'Idempotency-Key': randomUUID() }),
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de respuesta que cada prueba recorre a su manera
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, any> });
const put = (who: string, path: string, body: unknown) =>
  call(who, path, { method: 'PUT', body: JSON.stringify(body) });
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
  clock.set('2026-10-14T12:00:00.000Z');
  // TRUNCATE users CASCADE se lleva también la configuración (apunta a las firmas): se vuelve a crear su única fila.
  await suite.admin.query(
    `TRUNCATE users, files CASCADE; TRUNCATE idempotency_keys;
     INSERT INTO system_settings (id) VALUES (1);
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;`,
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
    const loginBody = (await res.json()) as { token: string };
    tokens[username] = loginBody.token;
  }
});

describe('RF-EMP-06: datos de la empresa', () => {
  it('todos los leen; al principio están vacíos', async () => {
    for (const who of ['ana', 'mario', 'oscar'])
      expect(await json(await call(who, '/company'))).toEqual({
        status: 200,
        body: { legalName: null, address: null, rowVersion: 1 },
      });
  });

  it('solo una Apoderada los cambia, con la versión que vio, y queda en la bitácora', async () => {
    const edit = { legalName: '  IMPOCARIBE S.A. ', address: 'Calle 1 No. 2, La Habana', expectedVersion: 1 };
    expect((await call('mario', '/company', { method: 'PATCH', body: JSON.stringify(edit) })).status).toBe(403);
    expect(await json(await call('ana', '/company', { method: 'PATCH', body: JSON.stringify(edit) }))).toEqual({
      status: 200,
      body: { legalName: 'IMPOCARIBE S.A.', address: 'Calle 1 No. 2, La Habana', rowVersion: 2 },
    });
    expect(await audit('company.edit')).toEqual([
      {
        ok: true,
        before: { legalName: null, address: null },
        after: { legalName: 'IMPOCARIBE S.A.', address: 'Calle 1 No. 2, La Habana' },
      },
    ]);
    // Otra Apoderada con la versión vieja: STALE_RECORD con la actual.
    const stale = await json(await call('ana', '/company', { method: 'PATCH', body: JSON.stringify(edit) }));
    expect([stale.status, stale.body.code, stale.body.details]).toEqual([409, 'STALE_RECORD', { currentVersion: 2 }]);
  });

  it('valida con las reglas de F-05', async () => {
    const res = await json(
      await call('ana', '/company', {
        method: 'PATCH',
        body: JSON.stringify({ legalName: 'AB', address: '', expectedVersion: 1 }),
      }),
    );
    expect([res.status, res.body.details]).toEqual([
      400,
      {
        fields: {
          legalName: 'La razón social debe tener entre 3 y 150 caracteres (tiene 2).',
          address: 'Escriba la dirección.',
        },
      },
    ]);
  });
});

describe('RF-EMP-01, 02 y 05: firma oficial', () => {
  it('solo las Apoderadas la cargan y la ven', async () => {
    for (const who of ['mario', 'oscar']) {
      expect((await call(who, '/company/signature')).status).toBe(403);
      expect((await put(who, '/company/signature', { ...SIGNATURE, image: b64(png(600, 200)) })).status).toBe(403);
    }
    expect(await json(await call('ana', '/company/signature'))).toEqual({
      status: 200,
      body: { current: null, history: [] },
    });
  });

  it('cargarla guarda el archivo en la carpeta de datos por su huella y la devuelve tal cual', async () => {
    const image = bigPng();
    const res = await json(await put('ana', '/company/signature', { ...SIGNATURE, image: b64(image) }));
    // La respuesta no repite la imagen: queda guardada con la clave de idempotencia (DT-22).
    expect(res).toEqual({
      status: 200,
      body: { id: expect.any(String), createdAt: '2026-10-14T12:00:00.000Z', createdBy: 'Ana Apoderada', ...SIGNATURE },
    });
    const sha = createHash('sha256').update(image).digest('hex');
    const [file] = (await suite.admin.query('SELECT sha256, mime, size_bytes, storage_path FROM files')).rows;
    expect(file).toEqual({
      sha256: sha,
      mime: 'image/png',
      size_bytes: '1500000',
      storage_path: `files/${sha.slice(0, 2)}/${sha}`,
    });
    expect(readFileSync(join(t.dataDir, file.storage_path)).equals(Buffer.from(image))).toBe(true);

    const got = await json(await call('ana', '/company/signature'));
    expect(got.body.current).toMatchObject({ ...SIGNATURE, mime: 'image/png', image: b64(image), id: res.body.id });
    expect(got.body.history).toEqual([res.body]);
  });

  it('reemplazarla deja la anterior intacta (los PDF emitidos la conservan) y queda en la bitácora sin la imagen', async () => {
    const first = (await json(await put('ana', '/company/signature', { ...SIGNATURE, image: b64(png(600, 200)) })))
      .body;
    clock.set('2026-10-15T09:00:00.000Z');
    const second = (
      await json(
        await put('ana', '/company/signature', {
          representativeName: 'Mario Delgado Pérez',
          credentialNo: '456',
          position: 'Director adjunto',
          image: b64(jpeg(800, 260)),
        }),
      )
    ).body;
    const got = (await json(await call('ana', '/company/signature'))).body;
    expect(got.current).toMatchObject({ id: second.id, mime: 'image/jpeg', representativeName: 'Mario Delgado Pérez' });
    expect(got.history.map((h: { id: string }) => h.id)).toEqual([second.id, first.id]);
    expect((await suite.admin.query('SELECT count(*)::int AS n FROM official_signatures')).rows).toEqual([{ n: 2 }]);
    expect(await audit('company.signature.replace')).toEqual([
      { ok: true, before: null, after: { id: first.id, ...SIGNATURE } },
      {
        ok: true,
        before: { id: first.id, ...SIGNATURE },
        after: {
          id: second.id,
          representativeName: 'Mario Delgado Pérez',
          credentialNo: '456',
          position: 'Director adjunto',
        },
      },
    ]);
  });

  it('una imagen que no sirve se rechaza con su motivo y no deja archivo', async () => {
    const res = await json(await put('ana', '/company/signature', { ...SIGNATURE, image: b64(png(200, 80)) }));
    expect([res.status, res.body.details]).toEqual([
      400,
      { fields: { image: 'La imagen mide 200 × 80 px; debe medir al menos 300 × 100 px.' } },
    ]);
    expect((await suite.admin.query('SELECT count(*)::int AS n FROM files')).rows).toEqual([{ n: 0 }]);
  });

  it('repetir la misma subida (misma clave) no crea otra firma', async () => {
    const key = randomUUID();
    const send = () =>
      t.fetch(`${t.base}/company/signature`, {
        method: 'PUT',
        headers: appHeaders({ Authorization: `Bearer ${tokens.ana}`, 'Idempotency-Key': key }),
        body: JSON.stringify({ ...SIGNATURE, image: b64(png(600, 200)) }),
      });
    const [a, b] = [await json(await send()), await json(await send())];
    expect(b).toEqual(a);
    expect((await suite.admin.query('SELECT count(*)::int AS n FROM official_signatures')).rows).toEqual([{ n: 1 }]);
  });

  it('el cuerpo grande solo se admite en las rutas de imágenes', async () => {
    const padding = 'x'.repeat(200_000);
    const res = await call('ana', '/company', {
      method: 'PATCH',
      body: JSON.stringify({ legalName: 'IMPOCARIBE S.A.', address: padding, expectedVersion: 1 }),
    });
    expect(await json(res)).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'La petición es demasiado grande para el servidor.' },
    });
  });
});

describe('RF-EMP-01 y 05: cuño oficial', () => {
  it('se carga, se reemplaza y se ve igual que la firma, solo por Apoderadas', async () => {
    for (const who of ['mario', 'oscar']) {
      expect((await call(who, '/company/stamp')).status).toBe(403);
      expect((await put(who, '/company/stamp', { image: b64(png(400, 400)) })).status).toBe(403);
    }
    const bad = await json(await put('ana', '/company/stamp', { image: b64(jpeg(120, 120)) }));
    expect([bad.status, bad.body.details]).toEqual([
      400,
      { fields: { image: 'La imagen mide 120 × 120 px; debe medir al menos 300 × 100 px.' } },
    ]);
    const first = (await json(await put('ana', '/company/stamp', { image: b64(png(400, 400)) }))).body;
    const second = (await json(await put('ana', '/company/stamp', { image: b64(jpeg(500, 500)) }))).body;
    const got = (await json(await call('ana', '/company/stamp'))).body;
    expect(got.current).toMatchObject({ id: second.id, mime: 'image/jpeg', image: b64(jpeg(500, 500)) });
    expect(got.history.map((h: { id: string }) => h.id)).toEqual([second.id, first.id]);
    expect((await audit('company.stamp.replace')).map((a) => a.ok)).toEqual([true, true]);
  });
});

describe('RF-EMP-04: ¿están la firma y el cuño?', () => {
  it('lo ven Apoderadas y Operadores; Solo lectura, no', async () => {
    expect(await json(await call('mario', '/company/official-status'))).toEqual({
      status: 200,
      body: { signature: false, stamp: false },
    });
    expect((await call('oscar', '/company/official-status')).status).toBe(403);
    await put('ana', '/company/signature', { ...SIGNATURE, image: b64(png(600, 200)) });
    expect((await json(await call('ana', '/company/official-status'))).body).toEqual({ signature: true, stamp: false });
    await put('ana', '/company/stamp', { image: b64(png(400, 400)) });
    expect((await json(await call('mario', '/company/official-status'))).body).toEqual({
      signature: true,
      stamp: true,
    });
  });
});

it('la misma imagen subida dos veces se guarda una sola vez en disco', async () => {
  const image = png(600, 200);
  await put('ana', '/company/stamp', { image: b64(image) });
  await put('ana', '/company/stamp', { image: b64(image) });
  const rows = (await suite.admin.query('SELECT DISTINCT storage_path FROM files')).rows;
  expect(rows).toHaveLength(1);
  expect(existsSync(join(t.dataDir, rows[0].storage_path))).toBe(true);
});
