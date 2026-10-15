import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserDiscovery, serverFromSearch } from './browser-platform';

// T038 · Plataforma del navegador de pruebas (plan §11.2): el servidor de la prueba se indica con ?server=host:puerto y
// se "descubre" con su GET /discovery real.
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

describe('serverFromSearch', () => {
  it.each([
    ['?server=127.0.0.1:8444', { address: '127.0.0.1', port: 8444 }],
    ['?device=phone&server=pc-servidor:8443', { address: 'pc-servidor', port: 8443 }],
    ['?server=127.0.0.1', null],
    ['?server=a b:1', null],
    ['', null],
  ])('%s → %j', (search, expected) => {
    expect(serverFromSearch(search)).toEqual(expected);
  });
});

describe('browserDiscovery', () => {
  it('anuncia el servidor indicado con lo que responde su /discovery', async () => {
    const discovery = browserDiscovery(`?server=127.0.0.1:${port}`);
    const expected = [{ address: '127.0.0.1', port, serverId: 'id-1', caFingerprint: 'AA:BB', version: '1.0.0' }];
    expect([await discovery.browse(1000), await discovery.broadcast(1000)]).toEqual([expected, expected]);
  });

  it('sin servidor indicado no encuentra nada, y una dirección que no responde da null', async () => {
    const discovery = browserDiscovery('');
    expect([await discovery.browse(200), await discovery.probe('127.0.0.1', 1, 300), await discovery.subnetAddresses()]).toEqual([
      [],
      null,
      [],
    ]);
  });
});
