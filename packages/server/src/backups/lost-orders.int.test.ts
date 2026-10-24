import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { useScenario, type Body } from '../../test/scenario.ts';
import { evaluateConditions } from '../alerts/conditions.ts';

// T109 · RF-RES-06, 07, contra PostgreSQL real: tras restaurar, las órdenes perdidas se recuperan con su número, sus
// versiones y su PDF original (validando el saldo) o se descartan con motivo; AL-19 sigue mientras queden.
vi.setConfig({ testTimeout: 180_000 });

const START = '2026-10-23T14:00:00.000Z';
const clock = new ManualClock(START);
const { s, post, get, q, call, login, forOrders } = useScenario(clock, START);
const PASSWORD = 'respaldo de prueba 2026';
const SAME_DAY = { sameDay: 'Segundo viaje del día autorizado por la terminal' };
const REASON = 'La orden no se llegó a entregar al chofer';

/** Una orden en el respaldo y dos emitidas después (60 y 30 t de una DM de 100 t); se restaura y se vuelve a entrar. */
async function restoredWithLost() {
  await call('ana', 'PUT', '/backups/password', { password: PASSWORD, confirm: PASSWORD });
  const w = await forOrders();
  await post('/orders', w.order({ tons: '5' }));
  const backup = (await post('/backups', {}, 'ana')).body;
  const second = (
    await post('/orders', w.order({ tons: '60', overrides: { ...SAME_DAY, capacity: SAME_DAY.sameDay } }))
  ).body;
  const third = (await post('/orders', w.order({ tons: '30', overrides: SAME_DAY }))).body;
  await post('/restores', { backupId: backup.id, password: PASSWORD, confirm: 'RESTAURAR' }, 'ana');
  await login();
  const lost = (await get('/lost-orders', 'ana')).body as Body[];
  const of = (n: string) => lost.find((l) => l.number === n)!;
  return { w, second, third, lost, of };
}
const al19 = async () => {
  await evaluateConditions(drizzle(s.suite.app), clock);
  return (await q(`SELECT status FROM alerts WHERE type = 'AL-19'`)).map((r) => r.status as string);
};

describe('T109 · órdenes perdidas (RF-RES-06, 07)', () => {
  it('se recupera con su id, su número, sus versiones y su PDF original; otra se descarta con motivo', async () => {
    const { w, second, third, lost, of } = await restoredWithLost();
    expect(lost.map((l) => [l.number, l.status, l.tons, l.orderStatus])).toEqual([
      [second.number, 'pending', '60.000', 'official'],
      [third.number, 'pending', '30.000', 'official'],
    ]);
    expect(of(second.number)).toMatchObject({
      declarationNumber: '00431',
      truckPlate: 'W011612',
      issuedByName: 'Mario Operador',
    });
    expect(await al19()).toEqual(['open']);
    expect((await get('/lost-orders')).body.code).toBe('FORBIDDEN');

    const recovered = await post(`/lost-orders/${of(second.number).id}/recover`, {}, 'ana');
    expect(recovered).toMatchObject({ status: 200, body: { status: 'recovered', resolvedByName: 'Ana Apoderada' } });
    expect((await get(`/orders/${second.id}`)).body).toMatchObject({
      id: second.id,
      number: second.number,
      current: { versionNo: 1, tons: '60.000', issuedByName: 'Mario Operador' },
    });
    const [pdf] = await q(
      `SELECT f.storage_path FROM load_order_versions v JOIN files f ON f.id = v.pdf_file_id WHERE v.order_id = $1`,
      [second.id],
    );
    expect(existsSync(join(s.t.dataDir, pdf!.storage_path as string))).toBe(true);
    expect((await get(`/declarations/${w.dm.id}`)).body.loadedTons).toBe('65.000');

    expect((await post(`/lost-orders/${of(third.number).id}/discard`, { reason: 'corto' }, 'ana')).body.code).toBe(
      'VALIDATION_ERROR',
    );
    expect((await post(`/lost-orders/${of(third.number).id}/discard`, { reason: REASON }, 'ana')).body).toMatchObject({
      status: 'discarded',
      discardReason: REASON,
    });
    expect((await post(`/lost-orders/${of(third.number).id}/recover`, {}, 'ana')).body.message).toBe(
      `La orden ${third.number} ya se descartó.`,
    );
    expect(await al19()).toEqual(['resolved']);
    expect(
      (
        await q(
          `SELECT action, ok, reason FROM audit_log WHERE action IN ('order.recover', 'order.lost.discard') ORDER BY id`,
        )
      ).map((r) => [r.action, r.ok, r.reason]),
    ).toEqual([
      ['order.recover', true, null],
      // El motivo corto lo rechaza la validación del formulario, antes de la escritura: no va a la bitácora.
      ['order.lost.discard', true, REASON],
      ['order.recover', false, null],
    ]);
  });

  it('si el saldo ya no alcanza, se dice por qué y queda en la lista', async () => {
    const { w, second, of } = await restoredWithLost();
    // Después de restaurar se emitió otra con el saldo que usaba la perdida.
    await post('/orders', w.order({ tons: '50', overrides: { ...SAME_DAY, capacity: SAME_DAY.sameDay } }));
    const res = await post(`/lost-orders/${of(second.number).id}/recover`, {}, 'ana');
    expect(res.body).toMatchObject({
      code: 'OVERDRAFT_ALLOCATION',
      message: `No alcanza el saldo: la orden ${second.number} lleva 60,000 t y quedan 45,000 t en la asignación.`,
    });
    const after = ((await get('/lost-orders', 'ana')).body as Body[]).find((l) => l.number === second.number)!;
    expect(after).toMatchObject({ status: 'pending', lastError: res.body.message });
  });
});
