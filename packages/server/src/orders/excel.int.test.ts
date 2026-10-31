import { ManualClock } from '@impocaribe/shared';
import { png } from '@impocaribe/shared/testing';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';

// T091 · spec §11.5, Const. art. XIII.8: el Excel de Impocaribe (anonimizado, fixtures/impocaribe-2026-09.json, T016)
// reproducido en el sistema, fila por fila y en su fecha: sin números repetidos ni perdidos, sin saldos negativos, y
// con los resultados calculados a mano.
interface Fixture {
  vessel: {
    name: string;
    manifest: string;
    bl: string;
    port: string;
    internalBuyer: string;
    arrivalDate: string;
    total: string;
  };
  declarations: { number: string; client: string; brand: string; total: string | null; createdOn: string }[];
  orders: {
    row: number;
    date: string;
    client: string;
    brand: string;
    driver: string;
    tons: string | null;
    cancelled: boolean;
  }[];
  expected: {
    orders: {
      row: number;
      result: 'issued' | 'issued_then_voided' | 'rejected';
      number?: string;
      tons?: string;
      code?: string;
      voidReason?: string;
    }[];
    declarations: {
      dm: string;
      total: string | null;
      allocated: string | null;
      loaded: string;
      balance: string | null;
    }[];
    vessel: { total: string; allocated: string; free: string; loaded: string; remaining: string };
    summary: { issued: number; issuedThenVoided: number; rejected: number; lastNumber: string };
  };
}

let suite: SuiteDb;
let t: TestApp;
let fx: Fixture;
const clock = new ManualClock('2026-09-04T14:00:00.000Z');
let token = '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de respuesta que la prueba recorre a su manera
type Body = Record<string, any>;
const call = (method: string, path: string, body?: unknown) =>
  t.fetch(`${t.base}${path}`, {
    method,
    headers: appHeaders({ Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Body });
const post = async (path: string, body: unknown) => json(await call('POST', path, body));
const login = async () => {
  const res = await t.fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({
      username: 'ana',
      password: 'contraseña1',
      deviceId: 'pc-ana',
      deviceLabel: 'ana',
      platform: 'windows',
    }),
  });
  token = ((await res.json()) as { token: string }).token;
};

beforeAll(async () => {
  fx = JSON.parse(await readFile(new URL('../../../../fixtures/impocaribe-2026-09.json', import.meta.url), 'utf8'));
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock);
  await drizzle(suite.app).transaction((tx) =>
    createUser(
      tx,
      clock,
      newUserSchema.parse({
        fullName: 'Ana Apoderada',
        username: 'ana',
        nationalId: '84011905548',
        phone: '52345678',
        role: 'apoderada',
        password: 'contraseña1',
        confirm: 'contraseña1',
      }),
    ),
  );
  await login();
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

describe('T091 · reproducción del Excel', () => {
  it('las 92 filas dan lo calculado a mano: números, rechazos, anulaciones y saldos', async () => {
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    await call('PUT', '/company/signature', {
      image: b64(png(900, 300)),
      representativeName: 'Representante de Prueba',
      credentialNo: '00123',
      position: 'Apoderada',
    });
    await call('PUT', '/company/stamp', { image: b64(png(400, 400)) });

    // Buque, clientes y DM del 04/09, día del arribo real (las DM con total, asignadas completas).
    const v = fx.vessel;
    const vessel = (
      await post('/vessels', {
        name: v.name,
        manifest: v.manifest,
        bl: v.bl,
        port: v.port,
        internalBuyer: v.internalBuyer,
        etaDate: '',
        arrivalDate: v.arrivalDate,
        totalTons: v.total,
      })
    ).body;
    expect(vessel.totalTons).toBe(v.total);
    const clients = new Map<string, Body>();
    // Algunas filas del Excel no tienen cliente: son las de «DM inexistente».
    for (const name of new Set(
      [...fx.declarations.map((d) => d.client), ...fx.orders.map((o) => o.client)].filter(Boolean),
    ))
      clients.set(
        name,
        (
          await post('/clients', {
            name,
            recipients: [{ name: `Almacén de ${name}`, address: 'Dirección del cliente' }],
          })
        ).body,
      );
    const dms = new Map<string, Body>();
    for (const d of fx.declarations) {
      const res = await post('/declarations', {
        number: d.number,
        clientId: clients.get(d.client)!.id,
        brand: d.brand,
        totalTons: d.total ?? '',
        ...(d.total ? { allocation: { vesselId: vessel.id, tons: d.total } } : {}),
      });
      expect(res.status).toBe(201);
      dms.set(`${d.client}|${d.brand}`, res.body);
    }

    // Regla 10: cada orden con su camión sintético de 34 t (la capacidad y el camión repetido no intervienen).
    const carrier = (await post('/carriers', { name: 'Transportes del Excel' })).body;
    const vehicles = new Map<number, { truck: string; trailer: string; driver: string }>();
    for (const o of fx.orders) {
      const n = String(o.row).padStart(4, '0');
      const trailer = (await post('/trailers', { carrierId: carrier.id, plate: `R${n}`, capacityTons: '34' })).body;
      const truck = (
        await post('/trucks', {
          carrierId: carrier.id,
          plate: `T${n}`,
          tractorPlate: '',
          baseLocation: '',
          trailerIds: [trailer.id],
        })
      ).body;
      const driver = (
        await post('/drivers', {
          fullName: `${o.driver} fila ${o.row}`,
          nationalId: `840119${String(o.row).padStart(5, '0')}`,
          licenseNo: `7${String(o.row).padStart(10, '0')}`,
          carrierId: carrier.id,
        })
      ).body;
      vehicles.set(o.row, { truck: truck.id, trailer: trailer.id, driver: driver.id });
    }

    // Fila por fila, en su fecha (emisión = carga).
    let day = '2026-09-04';
    const results: Body[] = [];
    for (const o of fx.orders) {
      if (o.date !== day) {
        day = o.date;
        clock.set(`${day}T14:00:00.000Z`);
        await login();
      }
      const dm = dms.get(`${o.client}|${o.brand}`);
      const client = clients.get(o.client);
      const w = vehicles.get(o.row)!;
      const res = await post('/orders', {
        declarationId: dm?.id ?? randomUUID(),
        allocationId: dm?.allocations[0]?.id ?? randomUUID(),
        recipientId: client?.recipients[0].id ?? randomUUID(),
        truckId: w.truck,
        trailerIds: [w.trailer],
        driverId: w.driver,
        tons: o.tons ?? '',
        waybillNo: `CP${o.row}`,
        loadingDate: o.date,
        lotNo: null,
        routeSheetNo: null,
        container: null,
      });
      if (res.status === 201 && o.cancelled) {
        const voided = await post(`/orders/${res.body.id}/void`, {
          reason: 'Cancelada en el Excel',
          expectedVersion: 1,
        });
        expect(voided.status).toBe(201);
        results.push({
          row: o.row,
          result: 'issued_then_voided',
          number: res.body.number,
          tons: res.body.current.tons,
        });
      } else if (res.status === 201)
        results.push({ row: o.row, result: 'issued', number: res.body.number, tons: res.body.current.tons });
      else results.push({ row: o.row, result: 'rejected', code: res.body.code });
    }

    const expected = fx.expected.orders.map((e) =>
      e.result === 'rejected'
        ? { row: e.row, result: e.result, code: e.code }
        : { row: e.row, result: e.result, number: e.number, tons: e.tons },
    );
    expect(results).toEqual(expected);

    // Saldos por DM y del buque, como en el resultado esperado.
    const all = (await json(await call('GET', '/declarations'))).body as Body[];
    for (const e of fx.expected.declarations) {
      const d = all.find((x) => x.number === e.dm)!;
      expect({
        dm: e.dm,
        total: d.totalTons,
        allocated: d.allocatedTons,
        loaded: d.loadedTons,
        balance: d.balanceTons,
      }).toEqual({
        dm: e.dm,
        total: e.total,
        allocated: e.allocated ?? '0.000',
        loaded: e.loaded,
        balance: e.balance,
      });
    }
    const after = (await json(await call('GET', `/vessels/${vessel.id}`))).body;
    expect({
      total: after.totalTons,
      allocated: after.allocatedTons,
      free: after.freeTons,
      loaded: after.loadedTons,
      remaining: after.remainingTons,
    }).toEqual(fx.expected.vessel);

    // Spec §11.1: sin números repetidos ni perdidos, y ningún saldo negativo.
    const seqs = (await suite.admin.query('SELECT seq FROM load_orders ORDER BY seq')).rows.map((r) => r.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    expect(seqs.length).toBe(fx.expected.summary.issued + fx.expected.summary.issuedThenVoided);
    expect((await suite.admin.query('SELECT 1 FROM v_allocation_balance WHERE balance_tons < 0')).rows).toEqual([]);
  }, 600_000);
});
