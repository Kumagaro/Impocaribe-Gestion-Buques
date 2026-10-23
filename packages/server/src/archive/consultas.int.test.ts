import { ManualClock } from '@impocaribe/shared';
import { describe, expect, it } from 'vitest';
import { useScenario, type Body } from '../../test/scenario.ts';
import { trackingHtml } from '../vessels/tracking.ts';

// T101, T103 y T104 · RF-BIT-02, 03, RF-CON-07, RF-TAB-03, 06, HU-10, HU-13, contra PostgreSQL real y Chromium real:
// la bitácora filtrada y por páginas, la búsqueda en el archivo (más de 12 meses) y el seguimiento de la DM en PDF.
const clock = new ManualClock('2026-08-29T14:00:00.000Z'); // 10:00 en La Habana
const { s, post, get, q, login, forOrders } = useScenario(clock, '2026-08-29T14:00:00.000Z');
const REASON = 'Peso corregido en la báscula del puerto';

const actions = (page: Body) => (page.entries as Body[]).map((e) => `${e.action}${e.ok ? '' : ' ✗'}`);

describe('T104 · bitácora (RF-BIT-02, 03, HU-13)', () => {
  it('por la orden 0042 (o su parte final): su emisión, su corrección con motivo, su descarga y quién hizo cada cosa', async () => {
    const w = await forOrders();
    const first = (await post('/orders', w.order())).body;
    await post('/orders', w.order({ tons: '10' }));
    clock.advance(3_600_000);
    await post(`/orders/${first.id}/corrections`, { ...w.order({ tons: '18' }), reason: REASON, expectedVersion: 1 });
    await get(`/orders/${first.id}/versions/2/pdf`, 'ana');

    for (const ref of ['1', '0001', first.number.toLowerCase()]) {
      const page = (await get(`/audit?ref=${ref}`, 'oscar')).body;
      expect(actions(page)).toEqual(['order.download', 'order.correct', 'order.issue']);
    }
    const [download, correct, issue] = (await get('/audit?ref=1', 'oscar')).body.entries as Body[];
    expect(correct).toMatchObject({
      userName: 'Mario Operador',
      deviceName: 'pc-mario',
      entityType: 'order',
      entityId: first.id,
      entityLabel: first.number,
      reason: REASON,
      ok: true,
      at: '2026-08-29T15:00:00.000Z',
    });
    expect([download!.userName, issue!.at]).toEqual(['Ana Apoderada', '2026-08-29T14:00:00.000Z']);
    // La DM por su número.
    expect(actions((await get('/audit?ref=431')).body)).toEqual(['declaration.create']);
    expect((await get('/audit?ref=431')).body.entries[0].entityLabel).toBe('DM 00431');
    // Lo que no existe no trae nada.
    expect((await get('/audit?ref=9999')).body).toEqual({ entries: [], next: null });
  });

  it('por usuario, grupo de acciones (con los rechazos) y fechas de La Habana', async () => {
    const w = await forOrders();
    await post('/orders', w.order({ tons: '101' })); // sobregiro: rechazado
    // 23:30 del mismo día en La Habana, pero ya 30/08 en UTC.
    clock.set('2026-08-30T03:30:00.000Z');
    await post('/orders', w.order({ tons: '5', loadingDate: '2026-08-30' }));

    const ana = (await q(`SELECT id FROM users WHERE username = 'ana'`))[0].id as string;
    expect(actions((await get(`/audit?userId=${ana}`)).body)).toEqual([
      'company.stamp.replace',
      'company.signature.replace',
      'auth.login',
    ]);
    expect(actions((await get('/audit?group=order')).body)).toEqual(['order.issue', 'order.issue ✗']);
    expect(actions((await get('/audit?group=catalog')).body)).toEqual([
      'driver.create',
      'truck.create',
      'trailer.create',
      'trailer.create',
      'carrier.create',
      'client.create',
    ]);
    expect(actions((await get('/audit?group=order&from=2026-08-29&to=2026-08-29')).body)).toEqual([
      'order.issue',
      'order.issue ✗',
    ]);
    expect(actions((await get('/audit?group=order&from=2026-08-30')).body)).toEqual([]);
    expect((await get('/audit?from=2026-08-30&to=2026-08-29')).body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: { to: '«Hasta» no puede ser anterior a «desde».' } },
    });
  });

  it('por páginas de 50, de la más reciente a la más antigua; nadie la cambia', async () => {
    await q(
      `ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;
       INSERT INTO audit_log (at, action, ok) SELECT now(), 'client.edit', true FROM generate_series(1, 60)`,
    );
    const first = (await get('/audit')).body;
    expect(first.entries).toHaveLength(50);
    const ids = (first.entries as Body[]).map((e) => e.id as number);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(first.next).toBe(ids.at(-1));
    const second = (await get(`/audit?before=${first.next}`)).body;
    expect([second.entries.length, second.next]).toEqual([10, null]);
    await expect(s.suite.app.query('UPDATE audit_log SET ok = false')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('T101 · archivo: lo de más de 12 meses (RF-CON-07, RF-TAB-03)', () => {
  it('encuentra la orden y la DM viejas por número, parte final, cliente o marca; lo reciente no', async () => {
    clock.set('2025-07-01T14:00:00.000Z');
    const w = await forOrders();
    const old = (await post('/orders', w.order())).body;
    clock.set('2026-08-29T14:00:00.000Z');
    await login();
    const recent = (
      await post('/declarations', {
        number: '00432',
        clientId: w.client.id,
        brand: 'Delicia',
        totalTons: '50',
        allocation: { vesselId: w.vessel.id, tons: '50' },
      })
    ).body;
    await post('/orders', { ...w.order(), declarationId: recent.id, allocationId: recent.allocations[0].id });

    const numbers = async (path: string) => ((await get(path, 'oscar')).body as Body[]).map((x) => x.number);
    expect(await numbers('/archive/orders?q=1')).toEqual([old.number]);
    expect(await numbers(`/archive/orders?q=${old.number.toLowerCase()}`)).toEqual([old.number]);
    expect(await numbers('/archive/orders?q=2')).toEqual([]);
    for (const text of ['431', '00431', 'nuevos tiempos', 'dosel'])
      expect(await numbers(`/archive/declarations?q=${encodeURIComponent(text)}`)).toEqual(['00431']);
    expect(await numbers('/archive/declarations?q=delicia')).toEqual([]);
    expect((await get('/archive/orders?q=')).body.code).toBe('VALIDATION_ERROR');
  });
});

describe('T103 · seguimiento de la DM en PDF (RF-TAB-06)', () => {
  it('etapa, saldos, asignaciones y órdenes, en un PDF para todos los roles', async () => {
    const w = await forOrders();
    const voided = (await post('/orders', w.order())).body;
    await post(`/orders/${voided.id}/void`, { reason: 'El camión no se presentó', expectedVersion: 1 });
    await post('/orders', w.order({ tons: '30' }));

    const res = await get(`/declarations/${w.dm.id}/tracking.pdf`, 'oscar');
    expect(res.status).toBe(200);
    expect([res.body.fileName, res.body.mime]).toEqual(['seguimiento-DM-00431.pdf', 'application/pdf']);
    expect(Buffer.from(res.body.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');

    const html = trackingHtml(
      {
        declaration: (await get(`/declarations/${w.dm.id}`)).body as never,
        clientName: 'Nuevos Tiempos S.R.L.',
        vesselNames: { [w.vessel.id]: 'Eagle 1' },
        orders: ((await get('/orders')).body as never[]) ?? [],
      },
      clock,
    );
    expect(html).toContain('Etapa: <b>En extracción</b> · día 1 de 30');
    expect(html).toContain(
      '<td>Eagle 1</td><td class="r">100,000 t</td><td class="r">30,000 t</td><td class="r">70,000 t</td>',
    );
    expect(html).toContain('Órdenes (2)');
    expect(html).toContain('<tr class="void">');
    expect((await get(`/declarations/${w.vessel.id}/tracking.pdf`)).body.code).toBe('NOT_FOUND');
  });
});
