import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createPlain } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { NativeTransport } from './transport.ts';

// T115 · DT-19 y DT-18: el transporte del proceso principal solo habla con el servidor esperado, por HTTPS; un intruso
// no recibe ni la petición. Certificados de prueba de shared (shared/test-certs).
const read = (name: string) => readFileSync(new URL(`../../../shared/test-certs/${name}`, import.meta.url));
const SERVER = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: new X509Certificate(read('ca.crt')).fingerprint256,
};

let good: Server;
let intruder: Server;
let goodUrl = '';
let intruderUrl = '';
let intruderHits = 0;
let wss: WebSocketServer;

const listen = async (server: Server) => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeAll(async () => {
  good = createServer(
    { cert: Buffer.concat([read('server.crt'), read('ca.crt')]), key: read('server.key') },
    (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(req.url === '/api/v1/vacio' ? 204 : 200, {
          'Content-Type': 'application/json',
          'X-Prueba': 'si',
        });
        res.end(
          req.url === '/api/v1/vacio'
            ? undefined
            : JSON.stringify({ method: req.method, size: Buffer.concat(chunks).length }),
        );
      });
    },
  );
  wss = new WebSocketServer({ server: good });
  wss.on('connection', (ws) => ws.on('message', (m) => ws.send(`eco: ${m.toString()}`)));
  intruder = createServer(
    { cert: Buffer.concat([read('intruder.crt'), read('rogue-ca.crt')]), key: read('intruder.key') },
    (_req, res) => {
      intruderHits++;
      res.end('{}');
    },
  );
  goodUrl = await listen(good);
  intruderUrl = await listen(intruder);
});

afterAll(async () => {
  wss.close();
  await Promise.all([good, intruder].map((s) => new Promise((r) => s.close(r))));
});

const GET = { method: 'GET', headers: {}, body: null };

describe('NativeTransport · HTTP', () => {
  it('con el servidor esperado: estado, cabeceras y cuerpo, también en bytes', async () => {
    const t = new NativeTransport(() => undefined);
    const res = await t.http(
      `${goodUrl}/api/v1/updates`,
      { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: new Uint8Array(2048) },
      SERVER,
    );
    expect(res.status).toBe(200);
    expect(res.headers).toContainEqual(['x-prueba', 'si']);
    expect(JSON.parse(Buffer.from(res.body!).toString())).toEqual({ method: 'POST', size: 2048 });
    expect((await t.http(`${goodUrl}/api/v1/vacio`, GET, SERVER)).body).toBeNull();
  });

  it('sin servidor esperado no sale nada; a un intruso no le llega la petición', async () => {
    const t = new NativeTransport(() => undefined);
    await expect(t.http(`${goodUrl}/api/v1/health`, GET)).rejects.toThrow(
      'No se sabe qué servidor debe responder: empareje este equipo de nuevo.',
    );
    await expect(t.http(`${intruderUrl}/api/v1/health`, GET, SERVER)).rejects.toThrow(
      'La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.',
    );
    expect(intruderHits).toBe(0);
  });

  it('http:// solo si se permite (servidor de pruebas sin TLS)', async () => {
    const plain = createPlain((_req, res) => res.end('{"ok":true}'));
    await new Promise<void>((r) => plain.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(plain.address() as AddressInfo).port}/api/v1/health`;
    await expect(new NativeTransport(() => undefined).http(url, GET)).rejects.toThrow(
      'La app solo habla con el servidor por HTTPS.',
    );
    expect(
      (
        await new NativeTransport(
          () => undefined,
          () => new Date(),
          true,
        ).http(url, GET)
      ).status,
    ).toBe(200);
    await new Promise((r) => plain.close(r));
  });
});

describe('NativeTransport · WebSocket', () => {
  it('abre, envía y recibe por su número; un intruso se cierra sin abrirse', async () => {
    const events: [number, string, string | undefined][] = [];
    const t = new NativeTransport((id, event, data) => events.push([id, event, data]));
    const id = t.open(`${goodUrl.replace('https', 'wss')}/api/v1/ws`, SERVER);
    await expect.poll(() => events.some(([i, e]) => i === id && e === 'open')).toBe(true);
    t.send(id, 'hola');
    await expect.poll(() => events.find(([i, e]) => i === id && e === 'message')?.[2]).toBe('eco: hola');
    t.close(id);
    await expect.poll(() => events.some(([i, e]) => i === id && e === 'close')).toBe(true);

    const bad = t.open(`${intruderUrl.replace('https', 'wss')}/api/v1/ws`, SERVER);
    await expect.poll(() => events.some(([i, e]) => i === bad && e === 'error')).toBe(true);
    expect(events.some(([i, e]) => i === bad && e === 'open')).toBe(false);
    expect(() => t.open(`${goodUrl.replace('https', 'wss')}/api/v1/ws`)).toThrow(
      'No se sabe qué servidor debe responder',
    );
  });
});
