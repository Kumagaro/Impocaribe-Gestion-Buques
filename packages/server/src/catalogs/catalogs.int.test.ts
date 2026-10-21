import { ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';

// T055 y T056 · RF-CAT-01 a 10, F-11 a F-13, plan §4.2, §4.4 y §6.2 (Catálogos): todos los leen; Apoderadas y
// Operadores los crean, editan, activan y desactivan; nada se borra; cada cambio se replica y queda en la bitácora.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const tokens: Record<string, string> = {};

const people = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
  ['oscar', 'Oscar Lectura', 'lectura', '86030406548'],
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de respuesta que cada prueba recorre a su manera
type Body = Record<string, any>;
const call = (who: string, method: string, path: string, body?: unknown) =>
  t.fetch(`${t.base}${path}`, {
    method,
    headers: appHeaders({ Authorization: `Bearer ${tokens[who]}`, 'Idempotency-Key': randomUUID() }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Body });
const post = async (path: string, body: unknown, who = 'mario') => json(await call(who, 'POST', path, body));
const patch = async (path: string, body: unknown, who = 'mario') => json(await call(who, 'PATCH', path, body));
const audit = async (action: string) =>
  (await suite.admin.query('SELECT ok, before, after, reason FROM audit_log WHERE action = $1 ORDER BY id', [action]))
    .rows;
const changes = async (entity: string) =>
  (
    await suite.admin.query('SELECT entity_id, audience, payload FROM change_log WHERE entity_type = $1 ORDER BY seq', [
      entity,
    ])
  ).rows;

async function carrier(name = 'Transportes Escambray') {
  return (await post('/carriers', { name })).body;
}
async function trailer(carrierId: string, plate: string, capacityTons = '30') {
  return (await post('/trailers', { carrierId, plate, capacityTons })).body;
}

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
     TRUNCATE truck_default_trailers, drivers, trucks, trailers, recipients, clients, carriers CASCADE;
     INSERT INTO system_settings (id) VALUES (1);
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;
     ALTER TABLE change_log DISABLE TRIGGER USER; TRUNCATE change_log; ALTER TABLE change_log ENABLE TRIGGER USER;`,
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

describe('roles', () => {
  it('Solo lectura los ve pero no los cambia; Apoderada y Operador, sí', async () => {
    expect((await post('/carriers', { name: 'Transportes Escambray' }, 'oscar')).status).toBe(403);
    expect((await post('/carriers', { name: 'Transportes Escambray' }, 'ana')).status).toBe(201);
    expect((await post('/carriers', { name: 'Transportes Habana' }, 'mario')).status).toBe(201);
    for (const path of ['/clients', '/carriers', '/trucks', '/trailers', '/drivers'])
      expect((await call('oscar', 'GET', path)).status).toBe(200);
    expect((await json(await call('oscar', 'GET', '/carriers'))).body.map((c: Body) => c.name).sort()).toEqual([
      'Transportes Escambray',
      'Transportes Habana',
    ]);
  });
});

describe('RF-CAT-01: clientes y destinatarios', () => {
  const almacen = { name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' };

  it('el nombre es único al normalizarlo: «NUEVOS TIEMPOS SRL» es el mismo cliente', async () => {
    const created = await post('/clients', { name: 'Nuevos Tiempos S.R.L.', recipients: [almacen] });
    expect(created).toMatchObject({
      status: 201,
      body: { name: 'Nuevos Tiempos S.R.L.', active: true, rowVersion: 1, recipients: [{ ...almacen, active: true }] },
    });
    const dup = await post('/clients', { name: 'NUEVOS TIEMPOS SRL', recipients: [almacen] });
    expect([dup.status, dup.body.details]).toEqual([
      400,
      { fields: { name: 'Ya existe el cliente «Nuevos Tiempos S.R.L.»: es el mismo nombre escrito de otra forma.' } },
    ]);
    // Replicado para todos, con sus destinatarios.
    expect(await changes('client')).toEqual([{ entity_id: created.body.id, audience: 'all', payload: created.body }]);
  });

  it('se editan el nombre y los destinatarios: se añaden y se desactivan, nunca se borran', async () => {
    const c = (await post('/clients', { name: 'Nuevos Tiempos', recipients: [almacen] })).body;
    const edited = await patch(`/clients/${c.id}`, {
      name: 'Nuevos Tiempos S.A.',
      recipients: [
        { ...c.recipients[0], active: false },
        { name: 'Almacén Este', address: 'Guanabacoa, La Habana' },
      ],
      expectedVersion: 1,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Nuevos Tiempos S.A.', rowVersion: 2 });
    expect(edited.body.recipients.map((r: Body) => [r.name, r.active])).toEqual([
      ['Almacén Central', false],
      ['Almacén Este', true],
    ]);
    // Un destinatario que no se envía se conserva: no se borra.
    const again = await patch(`/clients/${c.id}`, {
      name: 'Nuevos Tiempos S.A.',
      recipients: [edited.body.recipients[1]],
      expectedVersion: 2,
    });
    expect(again.body.recipients).toHaveLength(2);
    expect((await audit('client.edit'))[0]).toMatchObject({ ok: true, before: { name: 'Nuevos Tiempos' } });
  });

  it('un destinatario de otro cliente no se puede tocar', async () => {
    const a = (await post('/clients', { name: 'Cliente Uno', recipients: [almacen] })).body;
    const b = (await post('/clients', { name: 'Cliente Dos', recipients: [almacen] })).body;
    const res = await patch(`/clients/${b.id}`, {
      name: 'Cliente Dos',
      recipients: [a.recipients[0]],
      expectedVersion: 1,
    });
    expect([res.status, res.body.code]).toEqual([404, 'NOT_FOUND']);
  });

  it('con la versión vieja responde STALE_RECORD', async () => {
    const c = (await post('/clients', { name: 'Nuevos Tiempos', recipients: [almacen] })).body;
    await patch(`/clients/${c.id}`, { name: 'Nuevos Tiempos 2', recipients: c.recipients, expectedVersion: 1 });
    const res = await patch(`/clients/${c.id}`, {
      name: 'Nuevos Tiempos 3',
      recipients: c.recipients,
      expectedVersion: 1,
    });
    expect([res.status, res.body.code]).toEqual([409, 'STALE_RECORD']);
  });

  it('se desactiva y se activa, y queda en la bitácora', async () => {
    const c = (await post('/clients', { name: 'Nuevos Tiempos', recipients: [almacen] })).body;
    expect((await post(`/clients/${c.id}/deactivate`, undefined)).body).toMatchObject({ active: false, rowVersion: 2 });
    expect((await post(`/clients/${c.id}/activate`, undefined)).body).toMatchObject({ active: true, rowVersion: 3 });
    expect((await audit('client.deactivate')).map((a) => a.ok)).toEqual([true]);
  });
});

describe('RF-CAT-02 y 04: transportistas y remolques', () => {
  it('transportista con nombre único al normalizar', async () => {
    await carrier('Transportes Escambray');
    const dup = await post('/carriers', { name: 'TRANSPORTES  ESCAMBRAY.' });
    expect([dup.status, dup.body.details]).toEqual([
      400,
      {
        fields: {
          name: 'Ya existe el transportista «Transportes Escambray»: es el mismo nombre escrito de otra forma.',
        },
      },
    ]);
  });

  it('la chapa del remolque es única tras normalizarla: «w 011 612» repite «W011612»', async () => {
    const c = await carrier();
    expect(await trailer(c.id, 'W011612', '32,5')).toMatchObject({
      plate: 'W011612',
      capacityTons: '32.500',
      carrierId: c.id,
    });
    const dup = await post('/trailers', { carrierId: c.id, plate: 'w 011 612', capacityTons: '20' });
    expect([dup.status, dup.body.code, dup.body.details]).toEqual([
      409,
      'DUPLICATE_PLATE',
      { fields: { plate: 'Ya existe un remolque con la chapa W011612.' } },
    ]);
  });

  it('el transportista debe existir y estar activo', async () => {
    const c = await carrier();
    await post(`/carriers/${c.id}/deactivate`, undefined);
    const res = await post('/trailers', { carrierId: c.id, plate: 'P54321', capacityTons: '30' });
    expect([res.status, res.body.details]).toEqual([
      400,
      { fields: { carrierId: 'El transportista «Transportes Escambray» está inactivo: actívelo o elija otro.' } },
    ]);
    const missing = await post('/trailers', { carrierId: randomUUID(), plate: 'P54321', capacityTons: '30' });
    expect([missing.status, missing.body.details]).toEqual([400, { fields: { carrierId: 'Elija el transportista.' } }]);
  });

  it('un remolque habitual de camiones de otro transportista no cambia de transportista', async () => {
    const a = await carrier('Transportes Uno');
    const b = await carrier('Transportes Dos');
    const tr = await trailer(a.id, 'P54321');
    await post('/trucks', {
      carrierId: a.id,
      plate: 'W011612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: [tr.id],
    });
    const res = await patch(`/trailers/${tr.id}`, {
      carrierId: b.id,
      plate: 'P54321',
      capacityTons: '30',
      expectedVersion: 1,
    });
    expect([res.status, res.body.details]).toEqual([
      400,
      {
        fields: {
          carrierId: 'Es remolque habitual de camiones de su transportista (W011612): quítelo de ellos antes.',
        },
      },
    ]);
  });
});

describe('RF-CAT-03: camiones', () => {
  it('con dos remolques habituales, en orden, y la base por defecto', async () => {
    const c = await carrier();
    const [r1, r2] = [await trailer(c.id, 'P11111', '30'), await trailer(c.id, 'P22222', '20')];
    const res = await post('/trucks', {
      carrierId: c.id,
      plate: 'w 011 612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: [r2.id, r1.id],
    });
    expect(res).toMatchObject({
      status: 201,
      body: {
        plate: 'W011612',
        tractorPlate: null,
        baseLocation: 'LA HABANA',
        carrierId: c.id,
        trailerIds: [r2.id, r1.id],
      },
    });
    // Editar cambia los habituales.
    const edited = await patch(`/trucks/${res.body.id}`, {
      carrierId: c.id,
      plate: 'W011612',
      tractorPlate: 'T12345',
      baseLocation: 'Matanzas',
      trailerIds: [r1.id],
      expectedVersion: 1,
    });
    expect(edited.body).toMatchObject({
      tractorPlate: 'T12345',
      baseLocation: 'Matanzas',
      trailerIds: [r1.id],
      rowVersion: 2,
    });
  });

  it('sin remolque se rechaza (F-13) y la base lo impide aunque se salte el servicio', async () => {
    const c = await carrier();
    const res = await post('/trucks', {
      carrierId: c.id,
      plate: 'W011612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: [],
    });
    expect([res.status, res.body.details]).toEqual([
      400,
      { fields: { trailerIds: 'Elija al menos un remolque habitual: no hay camiones sin remolque.' } },
    ]);
    const tr = await trailer(c.id, 'P54321');
    const truck = (
      await post('/trucks', {
        carrierId: c.id,
        plate: 'W011612',
        tractorPlate: '',
        baseLocation: '',
        trailerIds: [tr.id],
      })
    ).body;
    await expect(
      suite.admin.query('DELETE FROM truck_default_trailers WHERE truck_id = $1', [truck.id]),
    ).rejects.toThrow(/al menos un remolque habitual/);
  });

  it('los remolques deben ser activos y del mismo transportista', async () => {
    const a = await carrier('Transportes Uno');
    const b = await carrier('Transportes Dos');
    const other = await trailer(b.id, 'P99999');
    const inactive = await trailer(a.id, 'P88888');
    await post(`/trailers/${inactive.id}/deactivate`, undefined);
    const res = await post('/trucks', {
      carrierId: a.id,
      plate: 'W011612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: [other.id, inactive.id],
    });
    expect([res.status, res.body.details]).toEqual([
      400,
      { fields: { trailerIds: 'El remolque P99999 es de otro transportista. El remolque P88888 está inactivo.' } },
    ]);
  });

  it('la chapa del camión es única', async () => {
    const c = await carrier();
    const tr = await trailer(c.id, 'P54321');
    await post('/trucks', {
      carrierId: c.id,
      plate: 'W011612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: [tr.id],
    });
    const dup = await post('/trucks', {
      carrierId: c.id,
      plate: 'W-011612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: [tr.id],
    });
    expect([dup.status, dup.body.code]).toEqual([409, 'DUPLICATE_PLATE']);
  });
});

describe('RF-CAT-05 y 09: choferes', () => {
  const juan = { fullName: 'Juan Carlos Miranda González', nationalId: '84011905548', licenseNo: '12345678901' };

  it('carné y licencia únicos', async () => {
    const c = await carrier();
    expect((await post('/drivers', { ...juan, carrierId: c.id })).status).toBe(201);
    const sameId = await post('/drivers', { ...juan, licenseNo: '99999999999', carrierId: c.id });
    expect([sameId.status, sameId.body.code, sameId.body.details]).toEqual([
      409,
      'DUPLICATE_NATIONAL_ID',
      { fields: { nationalId: 'Ya existe un chofer con el carné 84011905548.' } },
    ]);
    const sameLicense = await post('/drivers', { ...juan, nationalId: '85020306548', carrierId: c.id });
    expect([sameLicense.status, sameLicense.body.details]).toEqual([
      400,
      { fields: { licenseNo: 'Ya existe un chofer con la licencia 12345678901.' } },
    ]);
  });

  it('editar no cambia el transportista; cambiarlo pide motivo y queda en la bitácora', async () => {
    const a = await carrier('Transportes Uno');
    const b = await carrier('Transportes Dos');
    const d = (await post('/drivers', { ...juan, carrierId: a.id })).body;
    const edited = await patch(`/drivers/${d.id}`, {
      ...juan,
      fullName: 'Juan C. Miranda González',
      carrierId: b.id,
      expectedVersion: 1,
    });
    expect(edited.body).toMatchObject({ fullName: 'Juan C. Miranda González', carrierId: a.id, rowVersion: 2 });
    const short = await post(`/drivers/${d.id}/carrier`, { carrierId: b.id, reason: 'corto', expectedVersion: 2 });
    expect(short.status).toBe(400);
    const moved = await post(`/drivers/${d.id}/carrier`, {
      carrierId: b.id,
      reason: 'Se pasó a la flota de Transportes Dos',
      expectedVersion: 2,
    });
    expect(moved.body).toMatchObject({ carrierId: b.id, rowVersion: 3 });
    expect(await audit('driver.carrier')).toEqual([
      {
        ok: true,
        before: { carrierId: a.id },
        after: { carrierId: b.id },
        reason: 'Se pasó a la flota de Transportes Dos',
      },
    ]);
  });
});

describe('sincronización', () => {
  it('la instantánea trae los catálogos completos, incluidos los inactivos', async () => {
    const c = await carrier();
    const tr = await trailer(c.id, 'P54321');
    const truck = (
      await post('/trucks', {
        carrierId: c.id,
        plate: 'W011612',
        tractorPlate: '',
        baseLocation: '',
        trailerIds: [tr.id],
      })
    ).body;
    await post(`/trucks/${truck.id}/deactivate`, undefined);
    const snap = await json(await call('oscar', 'GET', '/sync/snapshot'));
    const byType = (type: string) =>
      snap.body.records.filter((r: Body) => r.entityType === type).map((r: Body) => r.payload);
    expect(byType('carrier')).toEqual([expect.objectContaining({ id: c.id, name: 'Transportes Escambray' })]);
    expect(byType('truck')).toEqual([expect.objectContaining({ id: truck.id, active: false, trailerIds: [tr.id] })]);
    expect(byType('trailer')).toEqual([expect.objectContaining({ id: tr.id, capacityTons: '30.000' })]);
  });
});
