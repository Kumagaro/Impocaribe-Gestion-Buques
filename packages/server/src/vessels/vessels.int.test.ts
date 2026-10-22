import fc from 'fast-check';
import { ManualClock, parseTons, tonsToApi, vesselBalances } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';
import { expireDue } from './expiry.ts';

// T062 a T068 · RF-BUQ, RF-DM, RF-ASG, RF-PLZ, D2, D6, D7, D11, D13, plan §5.5 a 5.7 y 5.11, contra PostgreSQL real.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-09-01T14:00:00.000Z');
const tokens: Record<string, string> = {};
const REASON = 'Ajuste acordado con el cliente';

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
const get = async (path: string, who = 'mario') => json(await call(who, 'GET', path));
const q = async (text: string, params: unknown[] = []) => (await suite.admin.query(text, params)).rows;

const vesselInput = (name: string, totalTons: string, arrivalDate = '') => ({
  name,
  manifest: '0080/2026',
  bl: 'BL-123',
  port: 'Mariel, terminal 2',
  internalBuyer: 'IMPOCARIBE S.A.',
  etaDate: '',
  arrivalDate,
  totalTons,
});
const vessel = async (name = 'Eagle 1', totalTons = '50000', arrivalDate = '2026-08-30') =>
  (await post('/vessels', vesselInput(name, totalTons, arrivalDate))).body;
let clientId: string;
const dm = async (number: string, totalTons: string | null = '80000', extra: object = {}) =>
  post('/declarations', { number, clientId, brand: 'Dosel', totalTons: totalTons ?? '', ...extra });

/** Las sesiones duran 24 h: tras adelantar el reloj días, se vuelve a entrar. */
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

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock);
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

beforeEach(async () => {
  clock.set('2026-09-01T14:00:00.000Z');
  await suite.admin.query(
    `ALTER TABLE customs_declaration_versions DISABLE TRIGGER USER; ALTER TABLE allocation_changes DISABLE TRIGGER USER;
     ALTER TABLE vessel_surplus_dispositions DISABLE TRIGGER USER;
     TRUNCATE vessel_surplus_dispositions, allocation_changes, allocations, customs_declaration_versions,
       customs_declarations, vessels CASCADE;
     ALTER TABLE customs_declaration_versions ENABLE TRIGGER USER; ALTER TABLE allocation_changes ENABLE TRIGGER USER;
     ALTER TABLE vessel_surplus_dispositions ENABLE TRIGGER USER;
     TRUNCATE users, files CASCADE; TRUNCATE idempotency_keys;
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
  }
  await login();
  clientId = (
    await post('/clients', {
      name: 'Nuevos Tiempos S.R.L.',
      recipients: [{ name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' }],
    })
  ).body.id;
});

describe('T062 · buques', () => {
  it('RF-BUQ-02, 03: el código sale del nombre y el viaje del orden de arribos del año', async () => {
    const pending = await vessel('Eagle 1', '50000', '');
    expect(pending).toMatchObject({ code: 'EAGLE1', arrivalDate: null, voyageNo: null, status: 'open' });
    const first = await vessel('EAGLE 1', '40000', '2026-08-10');
    expect(first.voyageNo).toBe(1);
    const arrived = await post(`/vessels/${pending.id}/arrival`, { arrivalDate: '2026-08-30', expectedVersion: 1 });
    expect(arrived.body).toMatchObject({ arrivalDate: '2026-08-30', voyageNo: 2, rowVersion: 2 });
    // Otro año, otra secuencia.
    clock.set('2027-01-10T14:00:00.000Z');
    await login();
    expect((await vessel('Eagle-1', '30000', '2027-01-09')).voyageNo).toBe(1);
  });

  it('RF-BUQ-07 y F-07: la fecha real no es futura y corregirla pide motivo', async () => {
    const v = await vessel('Sea Star', '30000', '');
    const future = await post(`/vessels/${v.id}/arrival`, { arrivalDate: '2026-09-02', expectedVersion: 1 });
    expect(future.body.details.fields.arrivalDate).toBe('La fecha de arribo real no puede ser futura.');
    expect((await post(`/vessels/${v.id}/arrival`, { arrivalDate: '2026-08-31', expectedVersion: 1 })).status).toBe(
      200,
    );
    const noReason = await post(`/vessels/${v.id}/arrival`, { arrivalDate: '2026-08-30', expectedVersion: 2 });
    expect(noReason.body.code).toBe('REASON_REQUIRED');
    const fixed = await post(`/vessels/${v.id}/arrival`, {
      arrivalDate: '2026-08-30',
      reason: REASON,
      expectedVersion: 2,
    });
    expect(fixed.body).toMatchObject({ arrivalDate: '2026-08-30', voyageNo: 1 });
    await suite.admin.query('UPDATE vessels SET last_order_seq = 1 WHERE id = $1', [v.id]);
    const locked = await post(`/vessels/${v.id}/arrival`, {
      arrivalDate: '2026-08-29',
      reason: REASON,
      expectedVersion: 3,
    });
    expect(locked.body.code).toBe('ARRIVAL_DATE_LOCKED');
  });

  it('RF-BUQ-05: el total pide motivo y no baja de lo asignado', async () => {
    const v = await vessel();
    const d = (await dm('00431', '30000')).body;
    await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '30000' });
    const edit = (totalTons: string, reason = '') =>
      patch(`/vessels/${v.id}`, { ...vesselInput('Eagle 1', totalTons), reason, expectedVersion: 1 });
    expect((await edit('45000')).body.code).toBe('REASON_REQUIRED');
    expect((await edit('29999,999', REASON)).body.code).toBe('TOTAL_BELOW_ALLOCATED');
    expect((await edit('45000', REASON)).body).toMatchObject({ totalTons: '45000.000', freeTons: '15000.000' });
    const [row] = await q("SELECT after->>'reason' AS reason FROM audit_log WHERE action = 'vessel.edit' AND ok");
    expect(row.reason).toBe(REASON);
  });

  it('tras el arribo, el nombre solo cambia si da el mismo código', async () => {
    const v = await vessel();
    const res = await patch(`/vessels/${v.id}`, { ...vesselInput('Eagle 2', '50000'), expectedVersion: 1 });
    expect(res.body.code).toBe('FIELD_IMMUTABLE');
    expect((await patch(`/vessels/${v.id}`, { ...vesselInput('EAGLE-1', '50000'), expectedVersion: 1 })).status).toBe(
      200,
    );
  });

  it('Solo lectura los ve, no los crea', async () => {
    expect((await post('/vessels', vesselInput('Eagle 1', '1'), 'oscar')).status).toBe(403);
    await vessel();
    expect((await get('/vessels', 'oscar')).body).toHaveLength(1);
  });
});

describe('T063 · DM y versiones', () => {
  it('RF-DM-01: la fecha la pone el servidor, en La Habana; el número no se repite nunca', async () => {
    // 00:30 del 02/09 en UTC es aún el 01/09 en La Habana.
    clock.set('2026-09-02T00:30:00.000Z');
    const d = await dm('00431');
    expect(d.status).toBe(201);
    expect(d.body).toMatchObject({
      number: '00431',
      declarationDate: '2026-09-01',
      deadlineStartDate: '2026-09-01',
      totalTons: '80000.000',
      pendingAllocationTons: '80000.000',
      versionNo: 1,
      rowVersion: 1,
    });
    const again = await dm('00431');
    expect([again.status, again.body.code]).toEqual([409, 'DUPLICATE_DM_NUMBER']);
    expect((await dm('0431')).body.details.fields.number).toBe('El número de DM debe tener 5 dígitos (tiene 4).');
  });

  it('RF-DM-04, 05, D6: cada edición es una versión con motivo; el total no baja de lo asignado', async () => {
    const v = await vessel();
    const d = (await dm('00431')).body;
    await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '20000' });
    const below = await post(`/declarations/${d.id}/versions`, {
      brand: 'Dosel',
      totalTons: '19999',
      reason: REASON,
      expectedVersion: 1,
    });
    expect(below.body.code).toBe('TOTAL_BELOW_ALLOCATED');
    const noTotal = await post(`/declarations/${d.id}/versions`, {
      brand: 'Dosel',
      totalTons: '',
      reason: REASON,
      expectedVersion: 1,
    });
    expect(noTotal.body.code).toBe('TOTAL_BELOW_ALLOCATED');
    const ok = await post(`/declarations/${d.id}/versions`, {
      brand: 'Dosel Premium',
      totalTons: '60000',
      reason: REASON,
      expectedVersion: 1,
    });
    expect(ok.body).toMatchObject({ brand: 'Dosel Premium', totalTons: '60000.000', versionNo: 2, rowVersion: 2 });
    const stale = await post(`/declarations/${d.id}/versions`, {
      brand: 'Otra',
      totalTons: '60000',
      reason: REASON,
      expectedVersion: 1,
    });
    expect(stale.body.code).toBe('STALE_RECORD');
    const history = (await get(`/declarations/${d.id}/history`)).body;
    expect(history.versions.map((x: Body) => [x.versionNo, x.kind, x.reason, x.createdBy])).toEqual([
      [2, 'edit', REASON, 'Mario Operador'],
      [1, 'create', null, 'Mario Operador'],
    ]);
  });

  it('D13: el cliente y la fecha no cambian ni tocando la base', async () => {
    const d = (await dm('00431')).body;
    await expect(
      suite.app.query("UPDATE customs_declarations SET declaration_date = '2026-08-01' WHERE id = $1", [d.id]),
    ).rejects.toThrow('no cambian (D13)');
    await expect(suite.app.query('DELETE FROM customs_declarations WHERE id = $1', [d.id])).rejects.toThrow(
      /permission denied|permiso denegado/,
    );
  });
});

describe('T064 · asignaciones (HU-04, RF-ASG-01 a 03, D2, D11)', () => {
  it('HU-04: si supera lo libre, avisa; con «sí» y motivo asigna lo libre y el resto queda pendiente', async () => {
    const v = await vessel('Eagle 1', '50000');
    const d = (await dm('00431', '80000')).body;
    const ask = await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '80000' });
    expect([ask.status, ask.body.code, ask.body.message, ask.body.details]).toEqual([
      422,
      'ALLOCATION_EXCEEDS_VESSEL',
      'La DM 00431 supera la cantidad restante del buque EAGLE1 en 30 000,000 t',
      { excessTons: '30000.000', freeTons: '50000.000' },
    ]);
    expect(await q('SELECT 1 FROM allocations')).toHaveLength(0);
    const yes = await post(`/declarations/${d.id}/allocations`, {
      vesselId: v.id,
      tons: '80000',
      confirmPartial: true,
      reason: REASON,
    });
    expect(yes.body).toMatchObject({ allocatedTons: '50000.000', pendingAllocationTons: '30000.000' });
    expect((await get(`/vessels/${v.id}`)).body.freeTons).toBe('0.000');
    expect(await q('SELECT kind, previous_tons, new_tons, reason FROM allocation_changes')).toEqual([
      { kind: 'partial_assign', previous_tons: '0.000', new_tons: '50000.000', reason: REASON },
    ]);
    // El resto, a otro buque.
    const other = await vessel('Ocean Pride', '40000');
    const rest = await post(`/declarations/${d.id}/allocations`, { vesselId: other.id, tons: '30000' });
    expect(rest.body.allocations.map((a: Body) => a.allocatedTons)).toEqual(['50000.000', '30000.000']);
    expect(rest.body.pendingAllocationTons).toBe('0.000');
  });

  it('D11: una DM sin total no se asigna; tampoco más de lo pendiente de la DM', async () => {
    const v = await vessel();
    const none = (await dm('00431', null)).body;
    expect((await post(`/declarations/${none.id}/allocations`, { vesselId: v.id, tons: '1' })).body.code).toBe(
      'DECLARATION_PENDING_TOTAL',
    );
    const d = (await dm('00432', '100')).body;
    expect((await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '100,001' })).body.code).toBe(
      'ALLOCATION_EXCEEDS_DECLARATION',
    );
  });

  it('RF-DM-03: el alta trae la asignación inicial en la misma operación', async () => {
    const v = await vessel();
    const d = await dm('00431', '1000', { allocation: { vesselId: v.id, tons: '1000' } });
    expect(d.body.allocations).toEqual([expect.objectContaining({ vesselId: v.id, allocatedTons: '1000.000' })]);
    // Si la asignación falla, no queda la DM a medias.
    const bad = await dm('00432', '60000', { allocation: { vesselId: v.id, tons: '60000' } });
    expect(bad.body.code).toBe('ALLOCATION_EXCEEDS_VESSEL');
    expect(await q("SELECT 1 FROM customs_declarations WHERE number = '00432'")).toHaveLength(0);
  });

  it('RF-ASG-03: cambiar una asignación pide motivo y versión; si sube, cabe en el buque', async () => {
    const v = await vessel('Eagle 1', '1000');
    const d = (await dm('00431', '2000')).body;
    const a = (await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '600' })).body.allocations[0];
    const tooMuch = await patch(`/allocations/${a.id}`, { tons: '1000,001', reason: REASON, expectedVersion: 1 });
    expect(tooMuch.body.code).toBe('ALLOCATION_EXCEEDS_VESSEL');
    const down = await patch(`/allocations/${a.id}`, { tons: '0', reason: REASON, expectedVersion: 1 });
    expect(down.body).toMatchObject({ allocatedTons: '0.000', rowVersion: 2 });
    expect((await patch(`/allocations/${a.id}`, { tons: '5', reason: REASON, expectedVersion: 1 })).body.code).toBe(
      'STALE_RECORD',
    );
  });

  it('se replica a todos y queda en la bitácora', async () => {
    const v = await vessel();
    const d = (await dm('00431')).body;
    await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '100' });
    const rows = await q(
      "SELECT entity_type, audience FROM change_log WHERE entity_type IN ('vessel', 'declaration') ORDER BY seq",
    );
    expect(rows.map((r) => r.entity_type)).toEqual(['vessel', 'declaration', 'vessel', 'declaration']);
    expect(new Set(rows.map((r) => r.audience))).toEqual(new Set(['all']));
    const [snap] = await q("SELECT payload FROM change_log WHERE entity_type = 'vessel' ORDER BY seq DESC LIMIT 1");
    expect(snap.payload).toMatchObject({ allocatedTons: '100.000', freeTons: '49900.000' });
  });
});

describe('T067 · vencimiento y reactivación (HU-09, RF-PLZ-03, 04, D7)', () => {
  it('al empezar el día 31 vence: el restante vuelve libre al buque; reactivada, el plazo empieza hoy', async () => {
    const v = await vessel();
    const d = (await dm('00431', '30000', { allocation: { vesselId: v.id, tons: '30000' } })).body;
    clock.set('2026-10-01T03:59:00.000Z'); // 30/09 a las 23:59 en La Habana
    await login();
    expect(await expireDue(drizzle(suite.app), clock)).toBe(0);
    clock.set('2026-10-01T04:00:00.000Z'); // 01/10 a las 00:00
    // Aún sin marcar, ya no admite asignaciones (la regla no depende de la tarea).
    expect((await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '1' })).body.code).toBe(
      'DECLARATION_EXPIRED',
    );
    expect(await expireDue(drizzle(suite.app), clock)).toBe(1);
    expect(await expireDue(drizzle(suite.app), clock)).toBe(0);
    const expired = (await get(`/declarations/${d.id}`)).body;
    expect(expired).toMatchObject({ allocatedTons: '0.000', pendingAllocationTons: '30000.000', versionNo: 2 });
    expect(expired.expiredAt).not.toBeNull();
    expect((await get(`/vessels/${v.id}`)).body.freeTons).toBe('50000.000');
    expect(await q("SELECT kind, new_tons FROM allocation_changes WHERE kind = 'expire_release'")).toEqual([
      { kind: 'expire_release', new_tons: '0.000' },
    ]);

    clock.set('2026-10-03T15:00:00.000Z');
    await login();
    const back = await post(`/declarations/${d.id}/reactivate`, {
      reason: REASON,
      expectedVersion: expired.rowVersion,
    });
    expect(back.body).toMatchObject({ deadlineStartDate: '2026-10-03', expiredAt: null, versionNo: 3 });
    expect((await post(`/declarations/${d.id}/allocations`, { vesselId: v.id, tons: '30000' })).status).toBe(201);
    const kinds = (await get(`/declarations/${d.id}/history`)).body.versions.map((x: Body) => x.kind);
    expect(kinds).toEqual(['reactivate', 'expire', 'create']);
  });

  it('reactivar antes de que pase la tarea también libera; una DM no vencida no se reactiva', async () => {
    const v = await vessel();
    const d = (await dm('00431', '30000', { allocation: { vesselId: v.id, tons: '30000' } })).body;
    expect((await post(`/declarations/${d.id}/reactivate`, { reason: REASON, expectedVersion: 1 })).body.message).toBe(
      'La DM 00431 no está vencida: no hace falta reactivarla.',
    );
    clock.set('2026-10-05T15:00:00.000Z');
    await login();
    const back = await post(`/declarations/${d.id}/reactivate`, { reason: REASON, expectedVersion: 1 });
    expect(back.body).toMatchObject({ allocatedTons: '0.000', deadlineStartDate: '2026-10-05' });
  });
});

describe('T068 · sobrante y cierre (RF-BUQ-08)', () => {
  it('no se cierra con 0,001 t sin destino; con transferencia y merma, sí; asignar a DM no es destino', async () => {
    const v = await vessel('Eagle 1', '100');
    const target = await vessel('Ocean Pride', '50');
    const d = (await dm('00431', '200')).body;
    const close = (version: number) => post(`/vessels/${v.id}/close`, { expectedVersion: version });
    expect((await close(1)).body).toMatchObject({ code: 'SURPLUS_UNRESOLVED', details: { unresolvedTons: '100.000' } });

    const give = (body: object, who = 'mario') =>
      post(`/vessels/${v.id}/surplus-dispositions`, { reason: REASON, ...body }, who);
    expect((await give({ kind: 'loss', tons: '1' })).status).toBe(403);
    // Decisión T068: un buque cerrado no admite órdenes, así que asignar a una DM no es destino del sobrante.
    expect((await give({ kind: 'allocate', tons: '60', targetDeclarationId: d.id })).body.code).toBe(
      'VALIDATION_ERROR',
    );
    const transfer = await give({ kind: 'transfer', tons: '99,999', targetVesselId: target.id });
    expect(transfer.body).toMatchObject({ unresolvedTons: '0.001' });
    expect((await get(`/vessels/${target.id}`)).body.totalTons).toBe('149.999');
    const current = (await get(`/vessels/${v.id}`)).body;
    expect((await close(current.rowVersion)).body.details).toEqual({ unresolvedTons: '0.001' });
    expect((await give({ kind: 'loss', tons: '0,002' }, 'ana')).body.details.fields.tons).toBe(
      'Supera el sobrante sin destino (0,001 t).',
    );
    expect((await give({ kind: 'loss', tons: '0,001' }, 'ana')).status).toBe(201);
    const closed = await close((await get(`/vessels/${v.id}`)).body.rowVersion);
    expect(closed.body).toMatchObject({ status: 'closed', unresolvedSurplusTons: '0.000' });

    // Cerrado: no admite asignaciones, ni recibe transferencias.
    const d2 = (await dm('00432', '10')).body;
    expect((await post(`/declarations/${d2.id}/allocations`, { vesselId: v.id, tons: '1' })).body.code).toBe(
      'VESSEL_CLOSED',
    );
    const back = await post(`/vessels/${target.id}/surplus-dispositions`, {
      kind: 'transfer',
      tons: '1',
      targetVesselId: v.id,
      reason: REASON,
    });
    expect(back.body.code).toBe('VESSEL_CLOSED');
    const surplus = (await get(`/vessels/${target.id}/surplus`)).body;
    expect(surplus.dispositions).toEqual([
      expect.objectContaining({ kind: 'transfer', tons: '99.999', incoming: true, otherVesselId: v.id }),
    ]);
  });

  it('lo asignado y no cargado solo se destina después de reducir la asignación', async () => {
    const v = await vessel('Eagle 1', '100');
    const target = await vessel('Ocean Pride', '50');
    const d = (await dm('00431', '100', { allocation: { vesselId: v.id, tons: '100' } })).body;
    const res = await post(`/vessels/${v.id}/surplus-dispositions`, {
      kind: 'transfer',
      tons: '10',
      targetVesselId: target.id,
      reason: REASON,
    });
    expect(res.body.details.fields.tons).toBe(
      'Solo hay 0,000 t libres: lo asignado y no cargado se destina después de reducir esa asignación.',
    );
    expect(d.allocations).toHaveLength(1);
  });

  it('dos transferencias cruzadas a la vez no se interbloquean', async () => {
    const a = await vessel('Eagle 1', '100');
    const b = await vessel('Ocean Pride', '100');
    const send = (from: string, to: string) =>
      post(`/vessels/${from}/surplus-dispositions`, {
        kind: 'transfer',
        tons: '10',
        targetVesselId: to,
        reason: REASON,
      });
    const results = await Promise.all([send(a.id, b.id), send(b.id, a.id), send(a.id, b.id), send(b.id, a.id)]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const totals = (await q('SELECT total_tons FROM vessels ORDER BY id')).map((r) => r.total_tons);
    expect(totals).toEqual(['120.000', '120.000']);
  });
});

describe('plan §4.3: las vistas y shared/domain dan los mismos saldos', () => {
  it('con asignaciones, transferencias y merma', async () => {
    const v = await vessel('Eagle 1', '1000');
    const other = await vessel('Ocean Pride', '10');
    await dm('00431', '300', { allocation: { vesselId: v.id, tons: '250,5' } });
    await dm('00432', '500', { allocation: { vesselId: v.id, tons: '123,456' } });
    await post(`/vessels/${v.id}/surplus-dispositions`, {
      kind: 'transfer',
      tons: '7,25',
      targetVesselId: other.id,
      reason: REASON,
    });
    await post(`/vessels/${v.id}/surplus-dispositions`, { kind: 'loss', tons: '0,75', reason: REASON }, 'ana');
    const dto = (await get(`/vessels/${v.id}`)).body;
    const rows = await q('SELECT allocated_tons FROM allocations WHERE vessel_id = $1', [v.id]);
    const own = vesselBalances({
      total: parseTons(dto.totalTons),
      allocations: rows.map((r) => ({ allocated: parseTons(r.allocated_tons), loaded: parseTons('0') })),
      disposedOut: parseTons('8'),
      allocatedAsDisposition: parseTons('0'),
    });
    expect({
      allocatedTons: dto.allocatedTons,
      freeTons: dto.freeTons,
      remainingTons: dto.remainingTons,
      surplusTons: dto.surplusTons,
      unresolvedSurplusTons: dto.unresolvedSurplusTons,
    }).toEqual({
      allocatedTons: tonsToApi(own.allocated),
      freeTons: tonsToApi(own.free),
      remainingTons: tonsToApi(own.remaining),
      surplusTons: tonsToApi(own.surplus),
      unresolvedSurplusTons: tonsToApi(own.unresolved),
    });
    expect(dto.freeTons).toBe('618.044');
  });
});

describe('T069 · propiedades de F5 (D2, D7, D11, D13)', () => {
  it('ninguna secuencia de asignar, cambiar, transferir, vencer y reactivar las rompe', async () => {
    let n = 0;
    const op = fc.oneof(
      fc.record({
        kind: fc.constant('allocate'),
        dm: fc.nat(1),
        vessel: fc.nat(1),
        tons: fc.integer({ min: 1, max: 150 }),
        confirm: fc.boolean(),
      }),
      fc.record({ kind: fc.constant('editAllocation'), dm: fc.nat(1), tons: fc.integer({ min: 0, max: 150 }) }),
      fc.record({ kind: fc.constant('editTotal'), dm: fc.nat(1), tons: fc.option(fc.integer({ min: 1, max: 200 })) }),
      fc.record({ kind: fc.constant('transfer'), vessel: fc.nat(1), tons: fc.integer({ min: 1, max: 60 }) }),
      fc.record({ kind: fc.constant('expire') }),
      fc.record({ kind: fc.constant('reactivate'), dm: fc.nat(1) }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 8 }), async (ops) => {
        n++;
        const vs = [await vessel(`Prop ${n} A`, '100'), await vessel(`Prop ${n} B`, '80')];
        const ds = [
          (await dm(String(n * 2).padStart(5, '0'), '120')).body,
          (await dm(String(n * 2 + 1).padStart(5, '0'), null)).body,
        ];
        for (const o of ops) {
          let res: { status: number } = { status: 200 };
          const d = 'dm' in o ? (await get(`/declarations/${ds[o.dm]!.id}`)).body : null;
          if (o.kind === 'allocate')
            res = await post(`/declarations/${d!.id}/allocations`, {
              vesselId: vs[o.vessel]!.id,
              tons: String(o.tons),
              ...(o.confirm ? { confirmPartial: true, reason: REASON } : {}),
            });
          else if (o.kind === 'editAllocation' && d!.allocations[0]) {
            const a = d!.allocations[0];
            res = await patch(`/allocations/${a.id}`, {
              tons: String(o.tons),
              reason: REASON,
              expectedVersion: a.rowVersion,
            });
          } else if (o.kind === 'editTotal')
            res = await post(`/declarations/${d!.id}/versions`, {
              brand: 'Dosel',
              totalTons: o.tons === null ? '' : String(o.tons),
              reason: REASON,
              expectedVersion: d!.rowVersion,
            });
          else if (o.kind === 'transfer')
            res = await post(`/vessels/${vs[o.vessel]!.id}/surplus-dispositions`, {
              kind: 'transfer',
              tons: String(o.tons),
              targetVesselId: vs[1 - o.vessel]!.id,
              reason: REASON,
            });
          else if (o.kind === 'expire') {
            clock.advance(31 * 86_400_000);
            await login();
            await expireDue(drizzle(suite.app), clock);
          } else if (o.kind === 'reactivate')
            res = await post(`/declarations/${d!.id}/reactivate`, { reason: REASON, expectedVersion: d!.rowVersion });
          // Las reglas rechazan con 4xx; un 5xx sería un fallo.
          expect(res.status).toBeLessThan(500);
        }

        // D2: lo asignado (más lo que salió) nunca supera el total del buque, ni lo asignado el total de la DM.
        expect(await q('SELECT 1 FROM v_vessel_balance WHERE free_tons < 0')).toEqual([]);
        expect(await q('SELECT 1 FROM v_declaration_balance WHERE pending_allocation_tons < 0')).toEqual([]);
        // D11: una DM sin total no tiene toneladas asignadas.
        expect(await q('SELECT 1 FROM v_declaration_balance WHERE total_tons IS NULL AND allocated_tons > 0')).toEqual(
          [],
        );
        // D7: una DM vencida (y no reactivada) no retiene toneladas por encima de lo cargado.
        expect(
          await q(`SELECT 1 FROM customs_declarations d JOIN v_allocation_balance b ON b.declaration_id = d.id
                    WHERE d.expired_at IS NOT NULL AND b.allocated_tons > b.loaded_tons`),
        ).toEqual([]);
        // D13: todas las versiones son de la misma DM, con su cliente y su fecha de siempre (las columnas no cambian).
        for (const original of ds) {
          const [row] = await q(
            'SELECT client_id, declaration_date::text AS date FROM customs_declarations WHERE id = $1',
            [original.id],
          );
          expect(row).toEqual({ client_id: original.clientId, date: original.declarationDate });
        }
      }),
      { numRuns: 12 },
    );
  }, 600_000);
});
