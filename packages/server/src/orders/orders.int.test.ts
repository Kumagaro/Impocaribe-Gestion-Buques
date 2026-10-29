import fc from 'fast-check';
import { ManualClock } from '@impocaribe/shared';
import { png } from '@impocaribe/shared/testing';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';
import { expireDue } from '../vessels/expiry.ts';

// T076 y T079 a T083 · RF-ORD-03 a 24, RF-EMP-03, 04, D1, D3 a D5, D15, plan §5.1 a 5.4 y 5.8, contra PostgreSQL real
// y Chromium real.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-08-29T14:00:00.000Z'); // 10:00 en La Habana
const tokens: Record<string, string> = {};
const REASON = 'Peso corregido en la báscula del puerto';

const people = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
  ['oscar', 'Oscar Lectura', 'lectura', '86030406548'],
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de respuesta que cada prueba recorre a su manera
type Body = Record<string, any>;
const call = (who: string, method: string, path: string, body?: unknown, key: string = randomUUID()) =>
  t.fetch(`${t.base}${path}`, {
    method,
    headers: appHeaders({ Authorization: `Bearer ${tokens[who]}`, 'Idempotency-Key': key }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Body });
const post = async (path: string, body: unknown, who = 'mario', key?: string) =>
  json(await call(who, 'POST', path, body, key));
const get = async (path: string, who = 'mario') => json(await call(who, 'GET', path));
const del = async (path: string, who = 'mario') => json(await call(who, 'DELETE', path));
const q = async (text: string, params: unknown[] = []) => (await suite.admin.query(text, params)).rows;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

async function login() {
  for (const [username] of people) {
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
}

/** El escenario: un buque llegado, una DM de 100 t asignada entera y un camión de dos remolques (30 + 20 t). */
let w: {
  vessel: Body;
  dm: Body;
  allocationId: string;
  recipientId: string;
  truck: Body;
  driver: Body;
  trailers: Body[];
  otherDriver: Body;
};
async function seal() {
  await call('ana', 'PUT', '/company/signature', {
    image: b64(png(900, 300)),
    representativeName: 'Ilén Fernández Rojas',
    credentialNo: '00123',
    position: 'Directora',
  });
  await call('ana', 'PUT', '/company/stamp', { image: b64(png(400, 400)) });
}
async function scenario(withSeal = true) {
  if (withSeal) await seal();
  const client = (
    await post('/clients', {
      name: 'Nuevos Tiempos S.R.L.',
      recipients: [{ name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' }],
    })
  ).body;
  const carrier = (await post('/carriers', { name: 'Transportes Escambray' })).body;
  const other = (await post('/carriers', { name: 'Transportes Habana' })).body;
  const trailers = [
    (await post('/trailers', { carrierId: carrier.id, plate: 'W006877', capacityTons: '30' })).body,
    (await post('/trailers', { carrierId: carrier.id, plate: 'W006878', capacityTons: '20' })).body,
  ];
  const truck = (
    await post('/trucks', {
      carrierId: carrier.id,
      plate: 'W011612',
      tractorPlate: '',
      baseLocation: '',
      trailerIds: trailers.map((x) => x.id),
    })
  ).body;
  const driver = (
    await post('/drivers', {
      fullName: 'Juan Carlos Miranda',
      nationalId: '84011905548',
      licenseNo: '12345678901',
      carrierId: carrier.id,
    })
  ).body;
  const otherDriver = (
    await post('/drivers', {
      fullName: 'Pedro Pérez Castillo',
      nationalId: '90051212345',
      licenseNo: '23456789012',
      carrierId: other.id,
    })
  ).body;
  const vessel = (
    await post('/vessels', {
      name: 'Eagle 1',
      manifest: '0080/2026',
      bl: 'BL-1',
      port: 'Mariel, terminal 2',
      internalBuyer: 'IMPOCARIBE S.A.',
      etaDate: '',
      arrivalDate: '2026-08-28',
      totalTons: '1000',
    })
  ).body;
  const dm = (
    await post('/declarations', {
      number: '00431',
      clientId: client.id,
      brand: 'Dosel',
      totalTons: '100',
      allocation: { vesselId: vessel.id, tons: '100' },
    })
  ).body;
  w = {
    vessel,
    dm,
    allocationId: dm.allocations[0].id,
    recipientId: client.recipients[0].id,
    truck,
    driver,
    trailers,
    otherDriver,
  };
}
const order = (extra: object = {}) => ({
  declarationId: w.dm.id,
  allocationId: w.allocationId,
  recipientId: w.recipientId,
  truckId: w.truck.id,
  trailerIds: w.trailers.map((x) => x.id),
  driverId: w.driver.id,
  tons: '17,28',
  waybillNo: '22352',
  loadingDate: '2026-08-30',
  lotNo: '',
  routeSheetNo: '',
  container: '',
  ...extra,
});
const balance = async () => (await get(`/declarations/${w.dm.id}`)).body;

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock);
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

beforeEach(async () => {
  clock.set('2026-08-29T14:00:00.000Z');
  await suite.admin.query(
    `ALTER TABLE load_order_versions DISABLE TRIGGER USER; ALTER TABLE load_order_version_trailers DISABLE TRIGGER USER;
     ALTER TABLE customs_declaration_versions DISABLE TRIGGER USER; ALTER TABLE allocation_changes DISABLE TRIGGER USER;
     ALTER TABLE vessel_surplus_dispositions DISABLE TRIGGER USER; ALTER TABLE vessels DISABLE TRIGGER USER;
     TRUNCATE drafts, load_order_version_trailers, load_order_versions, load_orders, vessel_surplus_dispositions,
       allocation_changes, allocations, customs_declaration_versions, customs_declarations, vessels CASCADE;
     ALTER TABLE load_order_versions ENABLE TRIGGER USER; ALTER TABLE load_order_version_trailers ENABLE TRIGGER USER;
     ALTER TABLE customs_declaration_versions ENABLE TRIGGER USER; ALTER TABLE allocation_changes ENABLE TRIGGER USER;
     ALTER TABLE vessel_surplus_dispositions ENABLE TRIGGER USER; ALTER TABLE vessels ENABLE TRIGGER USER;
     TRUNCATE users, files CASCADE; TRUNCATE idempotency_keys;
     TRUNCATE truck_default_trailers, drivers, trucks, trailers, recipients, clients, carriers CASCADE;
     INSERT INTO system_settings (id) VALUES (1);
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;
     ALTER TABLE change_log DISABLE TRIGGER USER; TRUNCATE change_log; ALTER TABLE change_log ENABLE TRIGGER USER;`,
  );
  const db = drizzle(suite.app);
  for (const [username, fullName, role, nationalId] of people)
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
  await login();
}, 60_000);

describe('T079 · emitir (RF-ORD-12 a 16, HU-01)', () => {
  it('numera, descuenta el saldo, archiva el PDF, deja la bitácora y se replica', async () => {
    await scenario();
    const res = await post('/orders', order());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      number: 'EAGLE1-2026-V1-0001',
      seq: 1,
      status: 'official',
      current: { versionNo: 1, tons: '17.280', status: 'official', issuedByName: 'Mario Operador' },
    });
    expect(await balance()).toMatchObject({ loadedTons: '17.280', balanceTons: '82.720' });
    const [v] = await q(
      `SELECT f.storage_path, v.pdf_sha256, v.snapshot FROM load_order_versions v JOIN files f ON f.id = v.pdf_file_id`,
    );
    const pdf = await readFile(join(t.dataDir, v.storage_path));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(v.snapshot).toMatchObject({
      number: 'EAGLE1-2026-V1-0001',
      issueDate: '2026-08-29',
      tons: '17.280',
      trailerPlates: ['W006877', 'W006878'],
      representativeName: 'Ilén Fernández Rojas',
      product: 'Harina de trigo',
      baseLocation: 'LA HABANA',
    });
    expect(await q("SELECT ok FROM audit_log WHERE action = 'order.issue'")).toEqual([{ ok: true }]);
    const replicated = await q(
      "SELECT entity_type FROM change_log WHERE entity_type IN ('order', 'vessel', 'declaration') AND seq > 6 ORDER BY seq",
    );
    expect(replicated.map((r) => r.entity_type).slice(-3)).toEqual(['order', 'vessel', 'declaration']);
  });

  it('RF-ORD-16: correlativo sin huecos; un rechazo no consume número', async () => {
    await scenario();
    expect((await post('/orders', order({ tons: '10' }))).body.number).toBe('EAGLE1-2026-V1-0001');
    expect((await post('/orders', order({ tons: '200' }))).body.code).toBe('OVERDRAFT_ALLOCATION');
    expect(
      (await post('/orders', order({ tons: '10', overrides: { sameDay: 'Segundo viaje del día autorizado' } }))).body
        .number,
    ).toBe('EAGLE1-2026-V1-0002');
    expect(await q('SELECT last_order_seq FROM vessels')).toEqual([{ last_order_seq: 2 }]);
    expect(await q("SELECT ok FROM audit_log WHERE action = 'order.issue' ORDER BY id")).toEqual([
      { ok: true },
      { ok: false },
      { ok: true },
    ]);
  });

  it('RF-EMP-04: sin firma y cuño oficiales no se emite', async () => {
    await scenario(false);
    expect((await post('/orders', order())).body.code).toBe('MISSING_OFFICIAL_SIGNATURE');
  });

  it('el sobregiro con el mensaje exacto; la capacidad y el camión repetido piden excepción', async () => {
    await scenario();
    const over = await post('/orders', order({ tons: '100,001' }));
    expect([over.status, over.body.code, over.body.message]).toEqual([
      422,
      'OVERDRAFT_ALLOCATION',
      'Esta orden pasa el saldo por 0,001 t. Quedan 100,000 t en la asignación.',
    ]);
    const cap = await post('/orders', order({ tons: '50,5' }));
    expect(cap.body).toMatchObject({
      code: 'CAPACITY_REQUIRES_OVERRIDE',
      details: { capacityTons: '50.000', excessTons: '0.500' },
    });
    const ok = await post(
      '/orders',
      order({ tons: '50,5', overrides: { capacity: 'Remolques reforzados, autorizado' } }),
    );
    expect(ok.body.current.capacityOverrideReason).toBe('Remolques reforzados, autorizado');
    expect((await post('/orders', order({ tons: '1' }))).body.code).toBe('SAME_DAY_REQUIRES_OVERRIDE');
  });

  it('chofer de otro transportista y fecha de carga fuera de rango', async () => {
    await scenario();
    expect((await post('/orders', order({ driverId: w.otherDriver.id }))).body.code).toBe('DRIVER_CARRIER_MISMATCH');
    expect((await post('/orders', order({ loadingDate: '2026-08-28' }))).body.code).toBe('LOADING_DATE_BEFORE_ISSUE');
    expect((await post('/orders', order({ loadingDate: '2026-09-06' }))).body.code).toBe('LOADING_DATE_TOO_FAR');
  });

  it('RF-ORD-24: a las 23:59:59 del día 30 pasa; a las 00:00 del 31 no, aunque la tarea no haya corrido', async () => {
    await scenario();
    clock.set('2026-09-28T03:59:59.000Z'); // 27/09 a las 23:59:59 en La Habana: día 30 (la DM es del 29/08)
    await login();
    expect((await post('/orders', order({ tons: '1', loadingDate: '2026-09-28' }))).status).toBe(201);
    clock.set('2026-09-28T04:00:00.000Z');
    await login();
    const late = await post('/orders', order({ tons: '1', loadingDate: '2026-09-28', overrides: { sameDay: REASON } }));
    expect(late.body.code).toBe('DECLARATION_EXPIRED');
  });

  it('D15: el mismo intento enviado dos veces crea una sola orden y devuelve la misma', async () => {
    await scenario();
    const key = randomUUID();
    const a = await post('/orders', order(), 'mario', key);
    const b = await post('/orders', order(), 'mario', key);
    expect(b.body.id).toBe(a.body.id);
    expect(await q('SELECT count(*)::int AS n FROM load_orders')).toEqual([{ n: 1 }]);
  });

  it('RF-ORD-05: la simulación dice qué falla, avisa y calcula sin emitir', async () => {
    await scenario();
    const res = await post('/orders/check', order({ tons: '99,5', loadingDate: '2026-08-30' }));
    expect(res.body).toMatchObject({
      allocationBalanceTons: '100.000',
      afterTons: '0.500',
      capacityTons: '50.000',
      problems: [{ code: 'CAPACITY_REQUIRES_OVERRIDE' }],
    });
    expect(res.body.warnings.map((x: Body) => x.field)).toEqual(['tons', 'loadingDate']);
    expect(await q('SELECT count(*)::int AS n FROM load_orders')).toEqual([{ n: 0 }]);
  });

  it('RF-BUQ-07: con órdenes, la fecha de arribo real ya no cambia', async () => {
    await scenario();
    await post('/orders', order());
    const v = (await get(`/vessels/${w.vessel.id}`)).body;
    expect(v.hasOrders).toBe(true);
    const res = await post(`/vessels/${w.vessel.id}/arrival`, {
      arrivalDate: '2026-08-27',
      reason: REASON,
      expectedVersion: v.rowVersion,
    });
    expect(res.body.code).toBe('ARRIVAL_DATE_LOCKED');
  });
});

describe('T080 · concurrencia (D1, Const. art. II y VI)', () => {
  it('seis emisiones a la vez por más de lo que queda: ninguna sobregira y los números no tienen huecos', async () => {
    await scenario();
    const tries = await Promise.all(
      Array.from({ length: 6 }, () =>
        post('/orders', order({ tons: '30', overrides: { sameDay: 'Varios viajes autorizados hoy' } })),
      ),
    );
    const ok = tries.filter((r) => r.status === 201);
    expect(ok).toHaveLength(3);
    expect(tries.filter((r) => r.status !== 201).map((r) => r.body.code)).toEqual([
      'OVERDRAFT_ALLOCATION',
      'OVERDRAFT_ALLOCATION',
      'OVERDRAFT_ALLOCATION',
    ]);
    expect(ok.map((r) => r.body.seq).sort()).toEqual([1, 2, 3]);
    expect(await balance()).toMatchObject({ loadedTons: '90.000', balanceTons: '10.000' });
  }, 60_000);
});

describe('T081 y T082 · corregir y anular (HU-02)', () => {
  // RF-ORD-01 y 02: la versión 1 queda Reemplazada y la vigente es la última no anulada.
  it('corregir crea la versión 2 con el mismo número y ajusta el saldo por la diferencia', async () => {
    await scenario();
    const o = (await post('/orders', order())).body;
    const fix = await post(`/orders/${o.id}/corrections`, {
      ...order({ tons: '20' }),
      reason: REASON,
      expectedVersion: 1,
    });
    expect(fix.body).toMatchObject({
      number: 'EAGLE1-2026-V1-0001',
      current: { versionNo: 2, tons: '20.000', reason: REASON },
      versions: [
        { versionNo: 1, status: 'replaced' },
        { versionNo: 2, status: 'official' },
      ],
    });
    expect(await balance()).toMatchObject({ loadedTons: '20.000' });
    const stale = await post(`/orders/${o.id}/corrections`, { ...order(), reason: REASON, expectedVersion: 1 });
    expect(stale.body.code).toBe('STALE_RECORD');
  });

  it('al corregir, la fecha de carga se compara con la emisión de la versión 1', async () => {
    await scenario();
    const o = (await post('/orders', order({ loadingDate: '2026-08-29' }))).body;
    clock.set('2026-08-31T14:00:00.000Z');
    await login();
    const res = await post(`/orders/${o.id}/corrections`, {
      ...order({ loadingDate: '2026-08-29' }),
      reason: REASON,
      expectedVersion: 1,
    });
    expect(res.status).toBe(201);
  });

  it('una DM vencida: la corrección no aumenta, y reducir devuelve la diferencia libre al buque', async () => {
    await scenario();
    const o = (await post('/orders', order({ tons: '20' }))).body;
    clock.set('2026-09-28T05:00:00.000Z');
    await login();
    await expireDue(drizzle(suite.app), clock);
    expect((await get(`/vessels/${w.vessel.id}`)).body.freeTons).toBe('980.000');
    const more = await post(`/orders/${o.id}/corrections`, {
      ...order({ tons: '20,001', loadingDate: '2026-09-28' }),
      reason: REASON,
      expectedVersion: 1,
    });
    expect(more.body.code).toBe('EXPIRED_CANNOT_INCREASE');
    const less = await post(`/orders/${o.id}/corrections`, {
      ...order({ tons: '15', loadingDate: '2026-09-28' }),
      reason: REASON,
      expectedVersion: 1,
    });
    expect(less.status).toBe(201);
    expect((await get(`/vessels/${w.vessel.id}`)).body.freeTons).toBe('985.000');
    expect(await q("SELECT kind, new_tons FROM allocation_changes WHERE kind = 'void_release'")).toEqual([
      { kind: 'void_release', new_tons: '15.000' },
    ]);
  });

  // RF-ORD-01 y 02: Anulada, y ya no hay versión vigente que corregir.
  it('anular repone todo el saldo, marca la versión y no admite más versiones', async () => {
    await scenario();
    const o = (await post('/orders', order())).body;
    const voided = await post(`/orders/${o.id}/void`, { reason: REASON, expectedVersion: 1 });
    expect(voided.body).toMatchObject({ status: 'voided', current: { versionNo: 2, status: 'voided' } });
    expect(await balance()).toMatchObject({ loadedTons: '0.000', balanceTons: '100.000' });
    const again = await post(`/orders/${o.id}/corrections`, { ...order(), reason: REASON, expectedVersion: 2 });
    expect(again.body.code).toBe('ORDER_VOIDED');
  });

  it('una versión emitida no cambia ni tocando la base', async () => {
    await scenario();
    await post('/orders', order());
    await expect(suite.app.query('UPDATE load_order_versions SET tons = 1')).rejects.toThrow('solo puede pasar');
    await expect(suite.app.query('DELETE FROM load_order_versions')).rejects.toThrow(
      /permission denied|permiso denegado/,
    );
  });
});

describe('T083 · descargas (RF-ORD-21)', () => {
  it('quien emitió baja el original 24 h; los demás y después, una copia; todo queda en la bitácora', async () => {
    await scenario();
    const o = (await post('/orders', order())).body;
    const mine = await get(`/orders/${o.id}/versions/1/pdf`);
    expect(mine.body).toMatchObject({ kind: 'original', fileName: 'EAGLE1-2026-V1-0001.pdf' });
    const stored = (await q('SELECT pdf_sha256 FROM load_order_versions'))[0].pdf_sha256;
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update(Buffer.from(mine.body.base64, 'base64')).digest('hex')).toBe(stored);
    const theirs = await get(`/orders/${o.id}/versions/1/pdf`, 'oscar');
    expect(theirs.body).toMatchObject({ kind: 'copy', fileName: 'EAGLE1-2026-V1-0001-copia.pdf' });
    expect(Buffer.from(theirs.body.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    clock.advance(24 * 3_600_000);
    await login();
    expect((await get(`/orders/${o.id}/versions/1/pdf`)).body.kind).toBe('copy');
    expect(await q("SELECT after->>'kind' AS kind FROM audit_log WHERE action = 'order.download' ORDER BY id")).toEqual(
      [{ kind: 'original' }, { kind: 'copy' }, { kind: 'copy' }],
    );
  }, 60_000);
});

// RF-ORD-01: los estados Borrador local (en el dispositivo, en P-14) y Borrador compartido, antes de ser Oficial.
describe('T076 · borradores (RF-ORD-06 a 11, D9)', () => {
  const payload = { tons: '17,28', waybillNo: '22352' };

  it('privado solo para su autor; compartido con bloqueo, latido, vencimiento y liberación por la Apoderada', async () => {
    const id = randomUUID();
    const d = (await post('/drafts', { clientDraftId: id, visibility: 'private', payload })).body;
    expect(d).toMatchObject({ visibility: 'private', ownerName: 'Mario Operador' });
    expect((await get('/drafts?scope=mine', 'ana')).body).toEqual([]);
    expect((await post(`/drafts/${d.id}/share`, {})).body.visibility).toBe('shared');
    expect((await get('/drafts?scope=shared', 'ana')).body).toHaveLength(1);

    expect((await post(`/drafts/${d.id}/lock`, {}, 'mario')).body.lockedByName).toBe('Mario Operador');
    const busy = await post(`/drafts/${d.id}/lock`, {}, 'ana');
    expect([busy.status, busy.body.code, busy.body.message]).toEqual([
      409,
      'DRAFT_LOCKED',
      'En edición por Mario Operador.',
    ]);
    clock.advance(9 * 60_000);
    await post(`/drafts/${d.id}/heartbeat`, {}, 'mario');
    clock.advance(9 * 60_000);
    expect((await post(`/drafts/${d.id}/lock`, {}, 'ana')).body.code).toBe('DRAFT_LOCKED');
    clock.advance(2 * 60_000);
    expect((await post(`/drafts/${d.id}/lock`, {}, 'ana')).body.lockedByName).toBe('Ana Apoderada');
    expect((await del(`/drafts/${d.id}/lock`, 'mario')).body.code).toBe('FORBIDDEN');
    await post(`/drafts/${d.id}/lock`, {}, 'ana');
    expect((await del(`/drafts/${d.id}/lock`, 'ana')).body.lockedById).toBeNull();
    expect((await del(`/drafts/${d.id}`, 'mario')).body.code).toBe('DRAFT_LOCKED');
  });

  it('RF-ORD-08: la subida en lote es idempotente y deja los borradores privados', async () => {
    const drafts = [
      { clientDraftId: randomUUID(), payload },
      { clientDraftId: randomUUID(), payload: { tons: '5' } },
    ];
    expect((await post('/drafts/sync', { drafts })).body).toHaveLength(2);
    expect((await post('/drafts/sync', { drafts })).body).toHaveLength(2);
    expect(await q('SELECT visibility, count(*)::int AS n FROM drafts GROUP BY visibility')).toEqual([
      { visibility: 'private', n: 2 },
    ]);
  });

  it('emitir desde un borrador lo cierra; descartar queda en la bitácora', async () => {
    await scenario();
    const d = (await post('/drafts', { clientDraftId: randomUUID(), visibility: 'private', payload })).body;
    expect((await post('/orders', order({ draftId: d.id }))).status).toBe(201);
    expect((await get('/drafts?scope=mine')).body).toEqual([]);
    const other = (await post('/drafts', { clientDraftId: randomUUID(), visibility: 'private', payload })).body;
    await del(`/drafts/${other.id}`);
    expect(await q("SELECT ok FROM audit_log WHERE action = 'draft.discard'")).toEqual([{ ok: true }]);
  });

  it('D9: el borrador privado de otro no se bloquea, ni se libera, ni sirve para emitir', async () => {
    await scenario();
    const d = (await post('/drafts', { clientDraftId: randomUUID(), visibility: 'private', payload }, 'ana')).body;
    expect((await post(`/drafts/${d.id}/lock`, {}, 'mario')).body.code).toBe('NOT_FOUND');
    expect((await post(`/drafts/${d.id}/heartbeat`, {}, 'mario')).body.code).toBe('NOT_FOUND');
    expect((await del(`/drafts/${d.id}/lock`, 'mario')).body.code).toBe('NOT_FOUND');
    expect((await post(`/drafts/${d.id}/lock`, {}, 'ana')).body.message).toBe(
      'Un borrador privado no se bloquea: solo lo edita su autor.',
    );
    const res = await post('/orders', order({ draftId: d.id }), 'mario');
    expect(res.body.code).toBe('NOT_FOUND');
    expect(await q('SELECT count(*)::int AS n FROM load_orders')).toEqual([{ n: 0 }]);
    expect(await q('SELECT last_order_seq AS n FROM vessels')).toEqual([{ n: 0 }]);
  });

  it('Solo lectura no ve ni crea borradores (ACLARAR-16)', async () => {
    expect((await get('/drafts?scope=shared', 'oscar')).status).toBe(403);
  });
});

describe('T084 · propiedades de órdenes (D1, D12, Const. art. VI)', () => {
  it('ninguna secuencia de emitir, corregir y anular deja saldo negativo, ni huecos o repeticiones en la numeración', async () => {
    await scenario();
    const SAME_DAY = { sameDay: 'Varios viajes autorizados hoy', capacity: 'Carga autorizada sobre la capacidad' };
    const op = fc.oneof(
      fc.record({ kind: fc.constant('issue'), tons: fc.integer({ min: 1, max: 40_000 }) }),
      fc.record({ kind: fc.constant('correct'), pick: fc.nat(), tons: fc.integer({ min: 1, max: 40_000 }) }),
      fc.record({ kind: fc.constant('void'), pick: fc.nat() }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 6 }), async (ops) => {
        for (const o of ops) {
          const tons = 'tons' in o ? (o.tons / 1000).toFixed(3) : '0';
          let res: { status: number };
          if (o.kind === 'issue') res = await post('/orders', order({ tons, overrides: SAME_DAY }));
          else {
            const all = (await get('/orders')).body as Body[];
            const open = all.filter((x) => x.status === 'official');
            if (open.length === 0) continue;
            const target = open[o.pick % open.length]!;
            res =
              o.kind === 'void'
                ? await post(`/orders/${target.id}/void`, { reason: REASON, expectedVersion: target.current.versionNo })
                : await post(`/orders/${target.id}/corrections`, {
                    ...order({ tons, overrides: SAME_DAY }),
                    reason: REASON,
                    expectedVersion: target.current.versionNo,
                  });
          }
          expect(res.status).toBeLessThan(500);
        }
        // D1: el saldo nunca es negativo, en la asignación ni en la DM.
        expect(await q('SELECT 1 FROM v_allocation_balance WHERE balance_tons < 0')).toEqual([]);
        expect(await q('SELECT 1 FROM v_declaration_balance WHERE balance_tons < 0')).toEqual([]);
        // Const. art. VI y D12: 1, 2, …, n sin huecos ni repeticiones, y el contador del buque en n.
        const seqs = (await q('SELECT seq FROM load_orders ORDER BY seq')).map((r) => r.seq);
        expect(seqs).toEqual(seqs.map((_, i) => i + 1));
        expect(await q('SELECT last_order_seq AS n FROM vessels')).toEqual([{ n: seqs.length }]);
        // Una anulada no carga nada; la vigente de cada orden es la última versión.
        expect(
          await q(`SELECT 1 FROM load_orders o JOIN load_order_versions v ON v.order_id = o.id
                    WHERE v.version_no > (SELECT version_no FROM load_order_versions c WHERE c.id = o.current_version_id)`),
        ).toEqual([]);
      }),
      { numRuns: 8 },
    );
  }, 600_000);
});
