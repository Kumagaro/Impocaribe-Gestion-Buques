import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { useScenario } from '../../test/scenario.ts';
import { Realtime } from '../sync/realtime.ts';
import { evaluateConditions } from './conditions.ts';

// T134 · RF-RED-01, contra PostgreSQL real: con el montaje hotspot, AL-21 con 8 o más dispositivos conectados; con 7
// no; con router, nunca. Los conectados se cuentan por dispositivo, no por conexión.
const clock = new ManualClock('2026-08-29T14:00:00.000Z');
const { s, q, token } = useScenario(clock, '2026-08-29T14:00:00.000Z');
const evaluate = (connectedDevices: number) => evaluateConditions(drizzle(s.suite.app), clock, { connectedDevices });
const al21 = () => q("SELECT status FROM alerts WHERE type = 'AL-21' ORDER BY created_at");
const setup = (kind: 'router' | 'hotspot') => q('UPDATE system_settings SET network_setup = $1', [kind]);
const open: WebSocket[] = [];
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
});

describe('AL-21: límite del hotspot', () => {
  it('con hotspot: 7 conectados no avisa, 8 sí, y al bajar de 8 se resuelve sola', async () => {
    await setup('hotspot');
    await evaluate(7);
    expect(await al21()).toEqual([]);
    await evaluate(8);
    expect(await al21()).toEqual([{ status: 'open' }]);
    await evaluate(12);
    expect(await al21()).toEqual([{ status: 'open' }]);
    await evaluate(7);
    expect(await al21()).toEqual([{ status: 'resolved' }]);
  });

  it('con router no avisa nunca', async () => {
    await setup('router');
    await evaluate(30);
    expect(await al21()).toEqual([]);
  });
});

describe('dispositivos conectados', () => {
  const connect = async (who: string) => {
    const socket = new WebSocket(`${s.t.base.replace('http', 'ws')}/ws`);
    open.push(socket);
    const ready = new Promise<void>((resolve) =>
      socket.on('message', (data) => {
        if ((JSON.parse(data.toString()) as { type: string }).type === 'ready') resolve();
      }),
    );
    socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token: token(who) })));
    await ready;
    return socket;
  };

  it('se cuentan por dispositivo: dos conexiones del mismo cuentan una; al cerrarse, se descuentan', async () => {
    const realtime = s.t.app.get(Realtime);
    await connect('ana');
    const mario = await connect('mario');
    await connect('mario');
    expect(realtime.connectedDevices()).toBe(2);
    mario.close();
    await expect.poll(() => realtime.connectedDevices()).toBe(2);
    for (const socket of open.splice(0)) socket.close();
    await expect.poll(() => realtime.connectedDevices()).toBe(0);
  });
});
