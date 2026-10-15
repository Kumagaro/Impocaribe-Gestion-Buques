import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSimulatedNetwork } from '../platform/test-discovery';
import type { DiscoveryMethod, ServerAnnouncement } from '../platform/platform';
import { DISCOVERY_BUDGET_MS, findServer } from './discovery';

// T036 · RF-RED-02 (métodos en orden), RF-RED-03 (otra identidad nunca se acepta) y RNF-17 (encontrarlo en menos de
// 10 s, también tras un cambio de dirección). El tiempo es el del reloj simulado de las pruebas.
const SERVER: ServerAnnouncement = {
  address: '192.168.1.10',
  port: 8443,
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: 'B2:99:E6:FB',
  version: '1.0.0',
};
const PAIRED = {
  serverId: SERVER.serverId,
  caFingerprint: 'b299e6fb',
  lastAddress: { address: '192.168.1.10', port: 8443 },
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Ejecuta la búsqueda con el reloj simulado y devuelve el resultado, los métodos probados y el tiempo que tardó. */
async function run(net: ReturnType<typeof createSimulatedNetwork>, known: Parameters<typeof findServer>[1]) {
  const methods: DiscoveryMethod[] = [];
  const start = Date.now();
  const promise = findServer(net, known, (m) => methods.push(m));
  await vi.runAllTimersAsync();
  return { found: await promise, methods, elapsed: Date.now() - start };
}

describe('RF-RED-02: los métodos se prueban en orden', () => {
  it('si la última dirección responde, no hace falta más', async () => {
    const { found, methods } = await run(createSimulatedNetwork({ servers: [SERVER] }), PAIRED);
    expect([found?.method, found?.address, methods]).toEqual(['last', '192.168.1.10', ['last']]);
  });

  it('con la multidifusión bloqueada cae a la difusión', async () => {
    const moved = { ...SERVER, address: '192.168.1.37' };
    const net = createSimulatedNetwork({ servers: [moved], multicastBlocked: true });
    const { found, methods } = await run(net, PAIRED);
    expect([found?.method, found?.address, methods]).toEqual([
      'broadcast',
      '192.168.1.37',
      ['last', 'dnssd', 'broadcast'],
    ]);
  });

  it('con la multidifusión y la difusión bloqueadas, busca en la subred', async () => {
    const moved = { ...SERVER, address: '192.168.1.200' };
    const net = createSimulatedNetwork({ servers: [moved], multicastBlocked: true, broadcastBlocked: true });
    const { found, methods } = await run(net, PAIRED);
    expect([found?.method, found?.address, methods]).toEqual([
      'subnet',
      '192.168.1.200',
      ['last', 'dnssd', 'broadcast', 'subnet'],
    ]);
  });

  it('sin nada que responda, termina sin servidor (y se ofrece QR o dirección a mano)', async () => {
    const net = createSimulatedNetwork({ multicastBlocked: true, broadcastBlocked: true });
    const { found, methods } = await run(net, PAIRED);
    expect([found, methods]).toEqual([null, ['last', 'dnssd', 'broadcast', 'subnet']]);
  });
});

describe('RNF-17: tras cambiar la IP del servidor, lo vuelve a encontrar en menos de 10 s', () => {
  it('con DNS-SD funcionando', async () => {
    const net = createSimulatedNetwork({ servers: [{ ...SERVER, address: '10.0.0.7' }] });
    const { found, elapsed } = await run(net, PAIRED);
    expect([found?.address, elapsed < 10_000]).toEqual(['10.0.0.7', true]);
  });

  it('en el peor caso, buscando en toda la subred', async () => {
    const net = createSimulatedNetwork({
      servers: [{ ...SERVER, address: '192.168.1.254' }],
      multicastBlocked: true,
      broadcastBlocked: true,
    });
    const { found, elapsed } = await run(net, PAIRED);
    expect([found?.address, elapsed < 10_000]).toEqual(['192.168.1.254', true]);
    expect(DISCOVERY_BUDGET_MS).toBeLessThan(10_000);
  });

  it('la búsqueda en la subred pregunta a las 254 direcciones', async () => {
    const net = createSimulatedNetwork({ multicastBlocked: true, broadcastBlocked: true });
    await run(net, { ...PAIRED, lastAddress: undefined });
    expect(new Set(net.probed).size).toBe(254);
  });
});

describe('RF-RED-03: solo se acepta la identidad emparejada', () => {
  it('un equipo con otra identidad que se anuncia antes se ignora', async () => {
    const intruder = { ...SERVER, address: '192.168.1.66', serverId: '00000000-0000-4000-8000-000000000000' };
    const net = createSimulatedNetwork({ servers: [intruder, { ...SERVER, address: '192.168.1.37' }] });
    const { found } = await run(net, PAIRED);
    expect(found?.address).toBe('192.168.1.37');
  });

  it('el mismo identificador con otra CA tampoco es el servidor', async () => {
    const forged = { ...SERVER, address: '192.168.1.66', caFingerprint: 'AA:AA:AA:AA' };
    const net = createSimulatedNetwork({ servers: [forged], multicastBlocked: false });
    const { found } = await run(net, { ...PAIRED, lastAddress: undefined });
    expect(found).toBeNull();
  });

  it('antes de emparejarse, acepta el primero que se anuncia (la persona lo confirma con el código)', async () => {
    const net = createSimulatedNetwork({ servers: [SERVER] });
    const { found } = await run(net, null);
    expect([found?.method, found?.serverId]).toEqual(['dnssd', SERVER.serverId]);
  });
});
