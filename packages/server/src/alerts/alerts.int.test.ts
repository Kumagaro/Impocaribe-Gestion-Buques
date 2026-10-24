import { ManualClock } from '@impocaribe/shared';
import { png } from '@impocaribe/shared/testing';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';
import { expireDue } from '../vessels/expiry.ts';
import { evaluateConditions } from './conditions.ts';

// T092 a T094 · RF-ALR-01 a 05, spec §5.13 (tabla AL), contra PostgreSQL real: el motor, las alertas por evento, las de
// condición, quién las ve y atiende, la sincronización y el aviso por WebSocket.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-08-29T14:00:00.000Z'); // 10:00 en La Habana
const tokens: Record<string, string> = {};
const REASON = 'Lo autoriza la dirección por la urgencia del cliente';

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
const get = async (path: string, who = 'mario') => json(await call(who, 'GET', path));
const q = async (text: string, params: unknown[] = []) => (await suite.admin.query(text, params)).rows;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const evaluate = () => evaluateConditions(drizzle(suite.app), clock);
/** Las alertas que ve cada uno, por tipo. */
const seen = async (who: string, query = '') =>
  ((await get(`/alerts${query}`, who)).body as Body[]).map((a) => `${a.type} ${a.status}`).sort();
const alertOf = async (type: string, who = 'ana') => ((await get(`/alerts?type=${type}`, who)).body as Body[])[0]!;

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

async function seal() {
  await call('ana', 'PUT', '/company/signature', {
    image: b64(png(900, 300)),
    representativeName: 'Ilén Fernández Rojas',
    credentialNo: '00123',
    position: 'Directora',
  });
  await call('ana', 'PUT', '/company/stamp', { image: b64(png(400, 400)) });
}

let client: Body;
let vessel: Body;
async function base(vesselTons = '1000') {
  client = (
    await post('/clients', {
      name: 'Nuevos Tiempos S.R.L.',
      recipients: [{ name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' }],
    })
  ).body;
  vessel = (
    await post('/vessels', {
      name: 'Eagle 1',
      manifest: '0080/2026',
      bl: 'BL-1',
      port: 'Mariel, terminal 2',
      internalBuyer: 'IMPOCARIBE S.A.',
      etaDate: '',
      arrivalDate: '2026-08-28',
      totalTons: vesselTons,
    })
  ).body;
}
const declaration = async (number: string, totalTons: string, allocation?: object) =>
  (await post('/declarations', { number, clientId: client.id, brand: 'Dosel', totalTons, allocation })).body;

/** Un camión de dos remolques (30 + 20 t) y una DM de 100 t asignada entera, para emitir órdenes. */
async function forOrders() {
  await seal();
  await base();
  const carrier = (await post('/carriers', { name: 'Transportes Escambray' })).body;
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
  const dm = await declaration('00431', '100', { vesselId: vessel.id, tons: '100' });
  return (extra: object = {}) => ({
    declarationId: dm.id,
    allocationId: dm.allocations[0].id,
    recipientId: client.recipients[0].id,
    truckId: truck.id,
    trailerIds: trailers.map((x) => x.id),
    driverId: driver.id,
    tons: '17,28',
    waybillNo: '22352',
    loadingDate: '2026-08-30',
    lotNo: '',
    routeSheetNo: '',
    container: '',
    ...extra,
  });
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
     TRUNCATE alerts, users, files CASCADE; TRUNCATE idempotency_keys;
     TRUNCATE truck_default_trailers, drivers, trucks, trailers, recipients, clients, carriers CASCADE;
     INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
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

describe('T092 · motor de alertas (RF-ALR-03, 05)', () => {
  it('una de condición no se repite mientras sigue abierta y se resuelve sola; cada cambio se replica', async () => {
    // AL-16 y AL-12 (sin contraseña de respaldo, RF-RES-05).
    expect(await evaluate()).toEqual({ opened: 2, resolved: 0 });
    expect(await evaluate()).toEqual({ opened: 0, resolved: 0 });
    expect(await alertOf('AL-16')).toMatchObject({
      kind: 'condition',
      status: 'open',
      title: 'Faltan la firma y el cuño oficiales',
      resolvedAt: null,
    });
    await seal();
    expect(await evaluate()).toEqual({ opened: 0, resolved: 1 });
    expect(await alertOf('AL-16')).toMatchObject({ status: 'resolved', resolvedAt: '2026-08-29T14:00:00.000Z' });
    // AL-16 la ven A y O: audiencia de editores, una vez al abrirse y otra al resolverse.
    expect(
      await q(
        `SELECT audience, payload->>'status' AS status FROM change_log
          WHERE entity_type = 'alert' AND payload->>'type' = 'AL-16' ORDER BY seq`,
      ),
    ).toEqual([
      { audience: 'editors', status: 'open' },
      { audience: 'editors', status: 'resolved' },
    ]);
  });

  it('cada rol ve solo las suyas (RF-ALR-05): el Operador no ve AL-05 ni AL-11; Lectura no ve AL-02', async () => {
    await base();
    await declaration('00431', ''); // pendiente: sin total
    await declaration('00432', '50'); // AL-02: hay otra pendiente
    await t.fetch(`${t.base}/auth/recover`, {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        username: 'mario',
        nationalId: '85020306548',
        phone: '52345678',
        code: 'K7QM-3XTP',
        password: 'contraseña2',
        confirm: 'contraseña2',
      }),
    });
    expect(await seen('ana')).toEqual(['AL-02 open', 'AL-11 open']);
    expect(await seen('mario')).toEqual(['AL-02 open']);
    expect(await seen('oscar')).toEqual([]);
    expect(await alertOf('AL-02', 'mario')).toMatchObject({
      title: 'DM 00432 registrada con 1 pendiente',
      detail: 'Pendientes: 00431.',
      entityType: 'declaration',
    });
    expect(await alertOf('AL-11')).toMatchObject({
      title: 'Recuperación de contraseña fallida de «mario»',
      detail: 'Los datos o el código de recuperación no coinciden.',
    });
  });

  it('atender: solo las de evento, solo quien dice la tabla AL, con su nombre y en la bitácora', async () => {
    await base();
    await declaration('00431', '');
    await declaration('00432', '50');
    await evaluate(); // AL-01 de las dos
    const al02 = await alertOf('AL-02');
    const al01 = await alertOf('AL-01');
    // Lectura no la ve: para ella no existe.
    expect((await post(`/alerts/${al02.id}/attend`, {}, 'oscar')).body.code).toBe('NOT_FOUND');
    expect((await post(`/alerts/${al01.id}/attend`, {}, 'ana')).body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Esta alerta se resuelve sola cuando desaparece su causa.',
    });
    clock.advance(60_000);
    const done = await post(`/alerts/${al02.id}/attend`, {}, 'mario');
    expect(done).toMatchObject({
      status: 200,
      body: { status: 'attended', attendedByName: 'Mario Operador', attendedAt: '2026-08-29T14:01:00.000Z' },
    });
    // Repetir no cambia quién la atendió.
    expect((await post(`/alerts/${al02.id}/attend`, {}, 'ana')).body.attendedByName).toBe('Mario Operador');
    expect(await seen('mario', '?status=open')).toEqual(['AL-01 open', 'AL-01 open', 'AL-16 open']);
    expect(
      await q(`SELECT action, ok, before, after FROM audit_log WHERE action = 'alert.attend' ORDER BY at, id`),
    ).toEqual([
      { action: 'alert.attend', ok: false, before: null, after: expect.objectContaining({ code: 'NOT_FOUND' }) },
      { action: 'alert.attend', ok: false, before: null, after: expect.objectContaining({ code: 'FORBIDDEN' }) },
      { action: 'alert.attend', ok: true, before: { status: 'open' }, after: { status: 'attended' } },
      { action: 'alert.attend', ok: true, before: { status: 'attended' }, after: { status: 'attended' } },
    ]);
  });
});

describe('T093 · alertas por evento', () => {
  it('AL-05: un intento real bloqueado por sobregiro avisa a las Apoderadas; la simulación no', async () => {
    const order = await forOrders();
    expect((await post('/orders/check', order({ tons: '101' }))).status).toBe(200);
    expect(await seen('ana')).toEqual([]);
    expect((await post('/orders', order({ tons: '101' }))).body.code).toBe('OVERDRAFT_ALLOCATION');
    expect(await alertOf('AL-05')).toMatchObject({
      title: 'Sobregiro bloqueado en la DM 00431',
      detail:
        'Mario Operador intentó emitir una orden: Esta orden pasa el saldo por 1,000 t. Quedan 100,000 t en la asignación.',
      entityType: 'declaration',
    });
    expect(await seen('mario')).toEqual([]);
    // Corregir por encima del saldo, también.
    const issued = (await post('/orders', order({ tons: '40' }))).body;
    const fix = await post(`/orders/${issued.id}/corrections`, {
      ...order({ tons: '120' }),
      reason: 'Peso corregido en la báscula del puerto',
      expectedVersion: 1,
    });
    expect(fix.body.code).toBe('OVERDRAFT_ALLOCATION');
    expect(await seen('ana')).toEqual(['AL-05 open', 'AL-05 open']);
  });

  it('AL-06 y AL-07: solo cuando la excepción hizo falta', async () => {
    const order = await forOrders();
    // Con motivo pero sin pasar la capacidad ni repetir camión: nada.
    await post('/orders', order({ tons: '10', overrides: { capacity: REASON } }));
    expect(await seen('ana')).toEqual([]);
    const big = await post('/orders', order({ tons: '51', overrides: { capacity: REASON, sameDay: REASON } }));
    expect(big.status).toBe(201);
    expect(await seen('ana')).toEqual(['AL-06 open', 'AL-07 open']);
    expect(await alertOf('AL-06')).toMatchObject({
      title: `Orden ${big.body.number} por encima de la capacidad`,
      detail: `Mario Operador la emitió con 51,000 t; los remolques admiten 50,000 t. Motivo: ${REASON}`,
      entityType: 'order',
      entityId: big.body.id,
    });
    expect(await alertOf('AL-07')).toMatchObject({ title: 'Camión W011612 con dos órdenes el 30/08/2026' });
    expect(await seen('mario')).toEqual([]);
  });

  it('AL-10: la asignación parcial, con su motivo', async () => {
    await base('100');
    await declaration('00431', '80', { vesselId: vessel.id, tons: '80' });
    await declaration('00432', '50', { vesselId: vessel.id, tons: '50', confirmPartial: true, reason: REASON });
    expect(await alertOf('AL-10', 'mario')).toMatchObject({
      title: 'Asignación parcial de la DM 00432 en Eagle 1',
      detail: `Se pidieron 50,000 t y el buque solo tenía 20,000 t libres. Motivo: ${REASON}`,
    });
  });

  it('AL-04: la DM vencida, para todos los roles', async () => {
    await base();
    await declaration('00431', '100', { vesselId: vessel.id, tons: '100' });
    clock.set('2026-09-28T05:00:00.000Z'); // día 31 en La Habana
    expect(await expireDue(drizzle(suite.app), clock)).toBe(1);
    await login();
    expect(await alertOf('AL-04', 'oscar')).toMatchObject({
      title: 'DM 00431 vencida',
      detail: 'Se desactivó al empezar el día 31. Lo asignado y no cargado (100,000 t) volvió libre a sus buques.',
    });
  });
});

describe('T094 · alertas por condición y tiempo', () => {
  it('AL-01, AL-03 y AL-09 de una DM, y su resolución al vencer', async () => {
    await seal();
    await base();
    await declaration('00431', '');
    await declaration('00432', '100', { vesselId: vessel.id, tons: '100' });
    await evaluate();
    expect(await seen('oscar')).toEqual(['AL-01 open']);
    expect(await alertOf('AL-01', 'oscar')).toMatchObject({
      title: 'DM 00431 pendiente',
      detail: 'No tiene total: regístrelo para poder asignarla.',
    });
    // 5 días sin órdenes desde la primera asignación: AL-09.
    clock.set('2026-09-03T14:00:00.000Z');
    await evaluate();
    await login();
    expect(await seen('oscar')).toEqual(['AL-01 open', 'AL-09 open']);
    // Día 25 de las dos.
    clock.set('2026-09-22T14:00:00.000Z');
    await evaluate();
    await login();
    expect(await seen('oscar')).toEqual(['AL-01 open', 'AL-03 open', 'AL-03 open', 'AL-09 open']);
    expect((await alertOf('AL-03', 'oscar')).title).toMatch(/^DM 0043[12] en el día 25 del plazo$/);
    // Día 31: vencidas, todo se resuelve aunque aún no se hayan marcado.
    clock.set('2026-09-28T14:00:00.000Z');
    expect(await evaluate()).toEqual({ opened: 0, resolved: 4 });
  });

  it('AL-08: el borrador compartido sin tocar más de 24 h lo ven las Apoderadas y su autor', async () => {
    await post('/drafts', { clientDraftId: randomUUID(), visibility: 'shared', payload: {} });
    clock.advance(24 * 3_600_000);
    await evaluate();
    await login();
    expect(await seen('ana')).toEqual(['AL-08 open', 'AL-12 open', 'AL-16 open']);
    expect(await seen('mario')).toEqual(['AL-08 open', 'AL-16 open']);
    expect((await alertOf('AL-08', 'mario')).targetUserId).toBe(
      (await q(`SELECT id FROM users WHERE username = 'mario'`))[0].id,
    );
    expect(
      await q(
        `SELECT audience FROM change_log WHERE entity_type = 'alert' AND payload->>'type' = 'AL-08' ORDER BY audience`,
      ),
    ).toEqual([{ audience: 'apoderada' }, { audience: expect.stringMatching(/^user:/) }]);
  });

  it('AL-17: buque cerrado con sobrante sin destino; AL-18: hora desfasada de un dispositivo', async () => {
    await seal();
    await base('100');
    await q(`UPDATE vessels SET status = 'closed'`);
    await q(`UPDATE devices SET clock_offset_ms = 360000, last_seen_at = now() WHERE id = 'pc-mario'`);
    await evaluate();
    expect(await seen('ana')).toEqual(['AL-12 open', 'AL-17 open', 'AL-18 open']);
    expect(await alertOf('AL-17')).toMatchObject({
      title: 'Buque Eagle 1 con sobrante sin destino',
      detail: 'Quedan 100,000 t sin destino: asígnelas, trasládelas o regístrelas como pérdida.',
    });
    expect(await alertOf('AL-18')).toMatchObject({ title: 'La hora de pc-mario está desfasada', entityId: 'pc-mario' });
    await q(`UPDATE devices SET clock_offset_ms = 1000`);
    expect(await evaluate()).toEqual({ opened: 0, resolved: 1 });
  });
});

describe('T092 · sincronización y aviso inmediato (RF-ALR-01)', () => {
  const open: WebSocket[] = [];
  afterEach(() => {
    for (const s of open.splice(0)) s.terminate();
  });

  function listen(who: string) {
    const socket = new WebSocket(`${t.base.replace('http', 'ws')}/ws`);
    open.push(socket);
    const messages: Body[] = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as Body));
    return new Promise<Body[]>((resolve) =>
      socket.once('open', () => {
        socket.send(JSON.stringify({ type: 'auth', token: tokens[who] }));
        resolve(messages);
      }),
    );
  }
  const until = async (messages: Body[], match: (m: Body) => boolean) => {
    for (let i = 0; i < 50 && !messages.some(match); i++) await new Promise((r) => setTimeout(r, 100));
    return messages.find(match);
  };

  it('alert.created llega en menos de 5 s a quien la ve, con tipo y referencia; la instantánea la respeta', async () => {
    const order = await forOrders();
    const ana = await listen('ana');
    const mario = await listen('mario');
    await until(ana, (m) => m.type === 'ready');
    await until(mario, (m) => m.type === 'ready');
    const started = Date.now();
    await post('/orders', order({ tons: '101' }));
    const got = await until(ana, (m) => m.type === 'alert.created');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(got).toEqual({
      type: 'alert.created',
      id: expect.any(String),
      alertType: 'AL-05',
      title: 'Sobregiro bloqueado en la DM 00431',
    });
    // Mario no la ve: no recibe alert.created (sí el aviso de sincronización, que no dice qué cambió).
    await until(mario, (m) => m.type === 'sync.available');
    await new Promise((r) => setTimeout(r, 300));
    expect(mario.filter((m) => m.type === 'alert.created')).toEqual([]);

    const snapshot = async (who: string) => {
      const out: Body[] = [];
      let cursor: string | null = null;
      do {
        const page: Body = (await get(`/sync/snapshot${cursor ? `?cursor=${cursor}` : ''}`, who)).body;
        out.push(...(page.records as Body[]).filter((r) => r.entityType === 'alert'));
        cursor = page.nextCursor as string | null;
      } while (cursor);
      return out.map((r) => r.payload.type as string);
    };
    expect(await snapshot('ana')).toEqual(['AL-05']);
    expect(await snapshot('mario')).toEqual([]);
  });
});
