import { BROADCAST_PROBE, SERVICE_TYPE } from '@impocaribe/shared';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import makeMdns from 'multicast-dns';
import { describe, expect, it, onTestFinished } from 'vitest';
import { broadcast, broadcastTargets, browse, lanInterfaces, parseDnsSd, probe, subnetAddresses } from './discovery.ts';

// T115 · DT-20 y RF-RED-02: lo que anuncia el servidor (T034) se lee igual aquí; la búsqueda, contra respondedores
// locales de verdad (UDP, mDNS y HTTP en 127.0.0.1).
const SERVER = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: 'AB:CD:EF',
  version: '1.4.0',
};
const instance = `IMPOCARIBE-7F3C.${SERVICE_TYPE}`;
/** Los registros que arma el servidor (server/src/discovery/announce.ts, dnsSdRecords). */
const RECORDS = [
  { name: SERVICE_TYPE, type: 'PTR', ttl: 120, data: instance },
  {
    name: instance,
    type: 'SRV',
    ttl: 120,
    data: { port: 8443, target: 'IMPOCARIBE-7F3C.local', priority: 0, weight: 0 },
  },
  {
    name: instance,
    type: 'TXT',
    ttl: 120,
    data: [Buffer.from(`id=${SERVER.serverId}`), Buffer.from('v=1.4.0'), Buffer.from('fp=AB:CD:EF')],
  },
  { name: 'IMPOCARIBE-7F3C.local', type: 'A', ttl: 120, data: '192.168.1.20' },
];

describe('direcciones de la red local', () => {
  it('la difusión de cada interfaz según su máscara, y la general', () => {
    expect(
      broadcastTargets([
        { address: '192.168.1.37', netmask: '255.255.255.0' },
        { address: '10.42.0.5', netmask: '255.255.0.0' },
      ]),
    ).toEqual(['192.168.1.255', '10.42.255.255', '255.255.255.255']);
  });

  it('la /24 de cada interfaz, sin la propia', () => {
    const list = subnetAddresses([{ address: '192.168.1.37', netmask: '255.255.255.0' }]);
    expect(list).toHaveLength(253);
    expect(list[0]).toBe('192.168.1.1');
    expect(list.at(-1)).toBe('192.168.1.254');
    expect(list).not.toContain('192.168.1.37');
  });
});

describe('DNS-SD', () => {
  it('lee el anuncio del servidor: dirección, puerto, identidad, versión y huella', () => {
    expect(parseDnsSd(RECORDS)).toEqual([{ address: '192.168.1.20', port: 8443, ...SERVER }]);
  });

  it('un anuncio sin huella o sin dirección no cuenta', () => {
    expect(parseDnsSd(RECORDS.filter((r) => r.type !== 'A'))).toEqual([]);
    expect(
      parseDnsSd(RECORDS.map((r) => (r.type === 'TXT' ? { ...r, data: [Buffer.from(`id=${SERVER.serverId}`)] } : r))),
    ).toEqual([]);
  });

  // Por la interfaz de la red local, como en una PC real (la multidifusión no sale por 127.0.0.1 en Windows).
  const lan = lanInterfaces()[0] ?? { address: '127.0.0.1', netmask: '255.0.0.0' };
  it('pregunta por el servicio y reúne la respuesta', async () => {
    const port = 15353 + Math.floor(Math.random() * 1000);
    const responder = makeMdns({ port, interface: lan.address, loopback: true, multicast: true, reuseAddr: true });
    onTestFinished(() => new Promise<void>((r) => responder.destroy(() => r())));
    responder.on('query', (q) => {
      if ((q.questions ?? []).some((x) => x.name === SERVICE_TYPE))
        responder.respond({ answers: [RECORDS[0] as never], additionals: RECORDS.slice(1) as never[] });
    });
    const found = await browse(1500, { port, interfaces: [lan] });
    expect(found).toEqual([{ address: '192.168.1.20', port: 8443, ...SERVER }]);
  });
});

describe('difusión UDP', () => {
  it('envía la sonda y toma la respuesta con la dirección de quien responde', async () => {
    const server = createSocket('udp4');
    onTestFinished(() => new Promise<void>((r) => server.close(() => r())));
    server.on('message', (msg, from) => {
      // A cualquier otra cosa que no sea la sonda, el servidor no responde.
      if (msg.toString() === BROADCAST_PROBE)
        server.send(JSON.stringify({ ...SERVER, port: 8443 }), from.port, from.address);
    });
    await new Promise<void>((r) => server.bind(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    expect(await broadcast(800, { port, targets: ['127.0.0.1'] })).toEqual([
      { address: '127.0.0.1', port: 8443, ...SERVER },
    ]);
  });
});

describe('sonda a /api/v1/discovery', () => {
  it('lee el anuncio; si no hay servidor o no es uno de los nuestros, null', async () => {
    const http = createServer((req, res) => {
      if (req.url === '/api/v1/discovery') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(SERVER));
      } else res.writeHead(404).end();
    });
    onTestFinished(() => new Promise<void>((r) => http.close(() => r())));
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const port = (http.address() as AddressInfo).port;
    expect(await probe('127.0.0.1', port, 2000, 'http')).toEqual({ address: '127.0.0.1', port, ...SERVER });
    // Nadie escucha en ese puerto.
    expect(await probe('127.0.0.1', 1, 1000, 'http')).toBeNull();
  });
});
