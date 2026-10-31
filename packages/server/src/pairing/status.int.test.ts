import { ManualClock } from '@impocaribe/shared';
import { SERVER_MEMORY_BUDGET_BYTES } from '@impocaribe/shared/validation';
import { networkInterfaces } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { appHeaders, memoryProbes, SIMULATED_MEMORY } from '../../test/app.ts';
import { useScenario } from '../../test/scenario.ts';
import { config } from '../config.ts';
import { lanInterface } from '../setup/facts.ts';
import { MEMORY_EVERY_MS } from './local.controller.ts';
import { parseWorkingSets } from './memory.ts';

// T128 · P-29 y plan §6.2 (GET /local/status), contra PostgreSQL real: el estado del servidor para su propia pantalla,
// con los dispositivos conectados ahora y la memoria contra el presupuesto de RNF-21. Solo desde la propia PC servidor.
const clock = new ManualClock('2026-08-29T14:00:00.000Z');
const { s, q, token } = useScenario(clock, '2026-08-29T14:00:00.000Z');
const status = async (base = s.t.base) => {
  const res = await fetch(`${base}/local/status`, { headers: appHeaders() });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const open: WebSocket[] = [];
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
});
async function connect(who: string) {
  const socket = new WebSocket(`${s.t.base.replace('http', 'ws')}/ws`);
  open.push(socket);
  const ready = new Promise<void>((resolve) =>
    socket.on('message', (data) => {
      if ((JSON.parse(data.toString()) as { type: string }).type === 'ready') resolve();
    }),
  );
  socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token: token(who) })));
  await ready;
}

describe('estado del servidor (P-29)', () => {
  it('versión, energía, montaje, dirección, dispositivos con los conectados y memoria contra el presupuesto', async () => {
    await q("UPDATE system_settings SET network_setup = 'hotspot'");
    await connect('ana');
    const { status: code, body } = await status();
    expect(code).toBe(200);
    const devices = (await q('SELECT id, name FROM devices WHERE revoked_at IS NULL ORDER BY paired_at')) as {
      id: string;
      name: string;
    }[];
    expect(body).toMatchObject({
      serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
      version: '1.0.0-test',
      // Con la energía simulada sin consultar: con corriente y sin porcentaje.
      power: { onBattery: false, percent: null, protected: false },
      network: {
        setup: 'hotspot',
        address: lanInterface(networkInterfaces())?.address ?? null,
        port: config().port,
      },
      memory: {
        budgetBytes: SERVER_MEMORY_BUDGET_BYTES,
        databaseBytes: SIMULATED_MEMORY.databaseBytes,
        pdfBytes: null,
      },
    });
    expect((body.devices as { id: string; connected: boolean }[]).map((d) => [d.id, d.connected])).toEqual(
      devices.map((d) => [d.id, d.id === 'pc-ana']),
    );
    expect((body.memory as { serviceBytes: number }).serviceBytes).toBeGreaterThan(0);
  });

  it('un dispositivo revocado ya no aparece', async () => {
    await q("UPDATE devices SET revoked_at = now() WHERE id = 'pc-mario'");
    const { body } = await status();
    expect((body.devices as { id: string }[]).map((d) => d.id)).not.toContain('pc-mario');
  });

  it('las Apoderadas activas, para el restablecimiento de emergencia', async () => {
    const res = await fetch(`${s.t.base}/local/apoderadas`, { headers: appHeaders() });
    const expected = await q(
      'SELECT username, full_name AS "fullName" FROM users WHERE role = \'apoderada\' AND active ORDER BY full_name',
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(await res.json()).toEqual(expected);
  });

  it('las peticiones seguidas comparten una medición de memoria; pasados 30 s se mide otra vez', async () => {
    clock.advance(MEMORY_EVERY_MS);
    const before = memoryProbes.count;
    await Promise.all([status(), status()]);
    await status();
    expect(memoryProbes.count - before).toBe(1);
    clock.advance(MEMORY_EVERY_MS);
    await status();
    expect(memoryProbes.count - before).toBe(2);
  });

  it('desde otra IP responde 403', async () => {
    expect(s.t.lanBase).not.toBeNull();
    expect(await status(s.t.lanBase!)).toEqual({
      status: 403,
      body: { code: 'FORBIDDEN', message: 'Solo se puede hacer desde la propia PC servidor.' },
    });
  });
});

describe('medida de la memoria en Windows', () => {
  it('suma por nombre de proceso lo que escribe PowerShell', () => {
    expect(parseWorkingSets('postgres=281018368\r\nchrome-headless-shell=188743680\r\n\r\n')).toEqual({
      postgres: 281018368,
      'chrome-headless-shell': 188743680,
    });
    expect(parseWorkingSets('')).toEqual({});
  });
});
