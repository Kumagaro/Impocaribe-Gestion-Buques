import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { stops } from '../../test/app.ts';
import { useScenario, type Body } from '../../test/scenario.ts';
import { evaluateConditions } from '../alerts/conditions.ts';
import { POWER_PROVIDER } from '../tokens.ts';
import { Power } from './power.ts';
import type { simulatedPower } from './provider.ts';

// HU-16: con batería baja el servidor se protege solo y no deja órdenes a medias.
// T132 · RF-ENE-01 a 05, plan §10.6, contra PostgreSQL real con el proveedor de energía simulado: al 15 % una emisión
// en curso termina y la siguiente recibe SERVER_PROTECTED_MODE; al volver la corriente se aceptan escrituras; los
// límites 15,0 % y 15,1 %; el aviso a las apps (server.power) y AL-20.
const clock = new ManualClock('2026-08-29T14:00:00.000Z'); // 10:00 en La Habana
const { s, post, forOrders, token, q } = useScenario(clock, '2026-08-29T14:00:00.000Z');
const power = () => s.t.app.get(Power);
const set = async (onBattery: boolean, percent: number | null) => {
  (s.t.app.get(POWER_PROVIDER) as ReturnType<typeof simulatedPower>).set({ onBattery, percent });
  await power().check();
};
const open: WebSocket[] = [];

async function listen(who: string): Promise<Body[]> {
  const socket = new WebSocket(`${s.t.base.replace('http', 'ws')}/ws`);
  open.push(socket);
  const messages: Body[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as Body));
  await new Promise<void>((resolve) =>
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'auth', token: token(who) }));
      resolve();
    }),
  );
  await expect.poll(() => messages.some((m) => m.type === 'ready')).toBe(true);
  return messages;
}

beforeEach(async () => {
  await set(false, null);
  stops.count = 0;
});
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
});

describe('modo protegido (RF-ENE-03)', () => {
  it('al 15 % una emisión en curso termina y la siguiente se rechaza; con corriente se vuelve a aceptar', async () => {
    const { order } = await forOrders();
    await set(true, 40);
    const inFlight = post('/orders', order());
    // La emisión ya entró (genera el PDF con Chromium: tarda más que esto).
    await new Promise((r) => setTimeout(r, 150));
    await set(true, 15);
    expect(await inFlight).toMatchObject({ status: 201 });
    const next = await post('/orders', order());
    expect([next.status, next.body.code]).toEqual([503, 'SERVER_PROTECTED_MODE']);
    expect(await q('SELECT count(*)::int AS n FROM load_orders')).toEqual([{ n: 1 }]);
    await set(false, 15);
    // El mismo camión el mismo día pide su excepción con motivo (regla de negocio, no de energía).
    const again = await post('/orders', order({ overrides: { sameDay: 'Segundo viaje autorizado por la dirección' } }));
    expect(again.status).toBe(201);
  });

  it('15,1 % todavía acepta escrituras; 15,0 % ya no', async () => {
    const { order } = await forOrders();
    await set(true, 15.1);
    expect(power().protected).toBe(false);
    expect((await post('/orders', order())).status).toBe(201);
    await set(true, 15);
    expect((await post('/orders', order())).status).toBe(503);
  });

  it('en modo protegido se puede seguir consultando y entrando', async () => {
    await set(true, 10);
    const res = await s.t.fetch(`${s.t.base}/auth/login`, {
      method: 'POST',
      headers: {
        'X-App-Version': '1.0.0',
        'Content-Type': 'application/json',
        'Idempotency-Key': '0192a3b4-0000-7000-8000-00000000f132',
      },
      body: JSON.stringify({
        username: 'oscar',
        password: 'contraseña1',
        deviceId: 'pc-oscar',
        deviceLabel: 'oscar',
        platform: 'windows',
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe('aviso a las apps y AL-20 (RF-ENE-02)', () => {
  it('cada cambio llega a las apps conectadas, y quien se conecta con batería lo recibe al entrar', async () => {
    const mario = await listen('mario');
    await set(true, 62);
    await expect
      .poll(() => mario.filter((m) => m.type === 'server.power'))
      .toEqual([{ type: 'server.power', onBattery: true, percent: 62, protected: false }]);
    const ana = await listen('ana');
    expect(ana.filter((m) => m.type === 'server.power')).toEqual([
      { type: 'server.power', onBattery: true, percent: 62, protected: false },
    ]);
    await set(false, 62);
    await expect
      .poll(() => mario.filter((m) => m.type === 'server.power').at(-1))
      .toEqual({ type: 'server.power', onBattery: false, percent: 62, protected: false });
  });

  it('AL-20 se abre con batería, otra al pasar a modo protegido, y se resuelven solas con corriente', async () => {
    const evaluate = () => evaluateConditions(drizzle(s.suite.app), clock, { power: power().state });
    const al20 = () => q("SELECT title, status FROM alerts WHERE type = 'AL-20' ORDER BY title");
    await set(true, 62);
    await evaluate();
    await set(true, 40);
    await evaluate();
    expect(await al20()).toEqual([{ title: 'El servidor funciona con batería', status: 'open' }]);
    await set(true, 15);
    await evaluate();
    expect(await al20()).toEqual([
      { title: 'El servidor funciona con batería', status: 'resolved' },
      { title: 'Servidor en modo protegido por batería baja', status: 'open' },
    ]);
    await set(false, 15);
    await evaluate();
    expect((await al20()).map((a) => a.status)).toEqual(['resolved', 'resolved']);
  });
});

describe('parada (RF-ENE-04)', () => {
  it('al 5 % se detiene de forma ordenada, una sola vez', async () => {
    await set(true, 6);
    expect(stops.count).toBe(0);
    await set(true, 5);
    await set(true, 4);
    expect([stops.count, power().protected]).toEqual([1, true]);
  });
});
