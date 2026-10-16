import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserDiscovery, createBrowserPlatform } from './browser-platform';

// T038 · Plataforma del navegador de pruebas (plan §11.2): el servidor es el propio origen de la página (vite lo
// redirige a /api) y se "descubre" con su GET /discovery real.
let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/api/v1/discovery') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ serverId: 'id-1', name: 'IMPOCARIBE-ID01', version: '1.0.0', caFingerprint: 'AA:BB' }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});

afterAll(() => {
  server.close();
});

describe('browserDiscovery', () => {
  it('anuncia el origen con lo que responde su /discovery', async () => {
    const discovery = browserDiscovery({ address: '127.0.0.1', port });
    const expected = [{ address: '127.0.0.1', port, serverId: 'id-1', caFingerprint: 'AA:BB', version: '1.0.0' }];
    expect([await discovery.browse(1000), await discovery.broadcast(1000)]).toEqual([expected, expected]);
  });

  it('si el origen no responde no encuentra nada, y una dirección que no responde da null', async () => {
    const discovery = browserDiscovery({ address: '127.0.0.1', port: 1 });
    expect([
      await discovery.browse(200),
      await discovery.probe('127.0.0.1', 1, 300),
      await discovery.subnetAddresses(),
    ]).toEqual([[], null, []]);
  });

  it('abierta en este equipo, el servidor de este equipo (127.0.0.1:8443) es el del origen', async () => {
    const discovery = browserDiscovery({ address: '127.0.0.1', port });
    expect(await discovery.probe('127.0.0.1', 8443, 1000)).toMatchObject({
      address: '127.0.0.1',
      port,
      serverId: 'id-1',
    });
    expect(await browserDiscovery({ address: '192.168.1.10', port }).probe('127.0.0.1', 8443, 300)).toBeNull();
  });
});

describe('createBrowserPlatform', () => {
  it.each([
    ['?device=phone', 'android'],
    ['?x=1&device=tablet', 'android'],
    ['?device=desktop', 'windows'],
    ['?device=phonex', 'windows'],
    ['', 'windows'],
  ])('%s se comporta como %s', (search, platform) => {
    const p = createBrowserPlatform({ hostname: '127.0.0.1', port: '5199', search }, '1.0.0');
    expect(p.deviceInfo().platform).toBe(platform);
  });
});
