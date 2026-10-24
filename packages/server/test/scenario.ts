// Escenario de órdenes contra PostgreSQL real para las pruebas de integración: base limpia antes de cada prueba, una
// Apoderada (ana), un Operador (mario) y Solo lectura (oscar) con sesión, y ayudas para llamar a la API.
import { havanaDate, type ManualClock } from '@impocaribe/shared';
import { png } from '@impocaribe/shared/testing';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createUser } from '../src/users/users.repo.ts';
import { appHeaders, createTestApp, type TestApp } from './app.ts';
import { createSuiteDb, type SuiteDb } from './suite-db.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de respuesta que cada prueba recorre a su manera
export type Body = Record<string, any>;

const PEOPLE = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
  ['oscar', 'Oscar Lectura', 'lectura', '86030406548'],
] as const;

export function useScenario(clock: ManualClock, start: string) {
  const s = {} as { suite: SuiteDb; t: TestApp };
  const tokens: Record<string, string> = {};

  const call = (who: string, method: string, path: string, body?: unknown) =>
    s.t.fetch(`${s.t.base}${path}`, {
      method,
      headers: appHeaders({ Authorization: `Bearer ${tokens[who]}`, 'Idempotency-Key': randomUUID() }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Body });
  const post = async (path: string, body: unknown, who = 'mario') => json(await call(who, 'POST', path, body));
  const get = async (path: string, who = 'mario') => json(await call(who, 'GET', path));
  const q = async (text: string, params: unknown[] = []) => (await s.suite.admin.query(text, params)).rows;
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
  const today = () => havanaDate(clock.now());

  async function login() {
    for (const [username] of PEOPLE) {
      const res = await s.t.fetch(`${s.t.base}/auth/login`, {
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

  /** Firma y cuño, un cliente, un buque llegado hoy (según el reloj) de 1 000 t, un camión de 30 + 20 t y una DM de 100 t asignada entera. */
  async function forOrders(dmNumber = '00431') {
    await seal();
    const client = (
      await post('/clients', {
        name: 'Nuevos Tiempos S.R.L.',
        recipients: [{ name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' }],
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
        arrivalDate: today(),
        totalTons: '1000',
      })
    ).body;
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
    const dm = (
      await post('/declarations', {
        number: dmNumber,
        clientId: client.id,
        brand: 'Dosel',
        totalTons: '100',
        allocation: { vesselId: vessel.id, tons: '100' },
      })
    ).body;
    const order = (extra: object = {}) => ({
      declarationId: dm.id,
      allocationId: dm.allocations[0].id,
      recipientId: client.recipients[0].id,
      truckId: truck.id,
      trailerIds: trailers.map((x) => x.id),
      driverId: driver.id,
      tons: '17,28',
      waybillNo: '22352',
      loadingDate: today(),
      lotNo: '',
      routeSheetNo: '',
      container: '',
      ...extra,
    });
    return { client, vessel, carrier, truck, driver, trailers, dm, order };
  }

  beforeAll(async () => {
    s.suite = await createSuiteDb();
    s.t = await createTestApp(s.suite, clock);
  }, 60_000);

  afterAll(async () => {
    await s.t.close();
    await s.suite.drop();
  });

  beforeEach(async () => {
    clock.set(start);
    await s.suite.admin.query(
      `ALTER TABLE load_order_versions DISABLE TRIGGER USER; ALTER TABLE load_order_version_trailers DISABLE TRIGGER USER;
       ALTER TABLE customs_declaration_versions DISABLE TRIGGER USER; ALTER TABLE allocation_changes DISABLE TRIGGER USER;
       ALTER TABLE vessel_surplus_dispositions DISABLE TRIGGER USER; ALTER TABLE vessels DISABLE TRIGGER USER;
       TRUNCATE drafts, load_order_version_trailers, load_order_versions, load_orders, vessel_surplus_dispositions,
         allocation_changes, allocations, customs_declaration_versions, customs_declarations, vessels CASCADE;
       ALTER TABLE load_order_versions ENABLE TRIGGER USER; ALTER TABLE load_order_version_trailers ENABLE TRIGGER USER;
       ALTER TABLE customs_declaration_versions ENABLE TRIGGER USER; ALTER TABLE allocation_changes ENABLE TRIGGER USER;
       ALTER TABLE vessel_surplus_dispositions ENABLE TRIGGER USER; ALTER TABLE vessels ENABLE TRIGGER USER;
       TRUNCATE alerts, users, files CASCADE; TRUNCATE idempotency_keys, restores;
       TRUNCATE truck_default_trailers, drivers, trucks, trailers, recipients, clients, carriers CASCADE;
       INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
       ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;
       ALTER TABLE change_log DISABLE TRIGGER USER; TRUNCATE change_log; ALTER TABLE change_log ENABLE TRIGGER USER;`,
    );
    const db = drizzle(s.suite.app);
    for (const [username, fullName, role, nationalId] of PEOPLE)
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

  return { s, call, post, get, q, login, seal, forOrders };
}
