import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { createNodeSocket, type NodeSocket } from './node-socket.ts';

// T043 · DT-19: el WebSocket de Node verifica la identidad del servidor como el transporte HTTP (T021).
const read = (name: string) => readFileSync(new URL(`../../test-certs/${name}`, import.meta.url));
const paired = {
  identity: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: new X509Certificate(read('ca.crt')).fingerprint256,
};

const servers: Record<string, { server: Server; url: string; received: string[] }> = {};

async function start(name: string, cert: string, key: string, caFile: string) {
  const server = createServer({ cert: Buffer.concat([read(cert), read(caFile)]), key: read(key) });
  const entry = { server, url: '', received: [] as string[] };
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) =>
    ws.on('message', (data) => {
      entry.received.push(data.toString());
      ws.send(`eco:${data.toString()}`);
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  entry.url = `wss://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/ws`;
  servers[name] = entry;
}

beforeAll(async () => {
  await start('good', 'server.crt', 'server.key', 'ca.crt');
  await start('intruder', 'intruder.crt', 'intruder.key', 'rogue-ca.crt');
});

afterAll(async () => {
  await Promise.all(Object.values(servers).map((s) => new Promise((r) => s.server.close(r))));
});

/** Abre el socket y devuelve el primer suceso: el eco de lo enviado al abrir, o el error. */
function roundTrip(socket: NodeSocket, payload: string): Promise<string> {
  return new Promise((resolve) => {
    socket.on('open', () => socket.send(payload));
    socket.on('message', (data) => {
      resolve(`mensaje ${data}`);
      socket.close();
    });
    socket.on('error', (err) => resolve(`error ${err}`));
  });
}

describe('createNodeSocket', () => {
  it('se conecta al servidor emparejado por una IP que no figura en el certificado y conversa', async () => {
    const socket = createNodeSocket(paired)(servers.good!.url);
    expect(await roundTrip(socket, '{"type":"auth","token":"t"}')).toBe('mensaje eco:{"type":"auth","token":"t"}');
  });

  it('rechaza a un intruso con otra CA y el intruso no recibe el token', async () => {
    const socket = createNodeSocket(paired)(servers.intruder!.url);
    expect(await roundTrip(socket, '{"type":"auth","token":"secreto"}')).toBe(
      'error La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.',
    );
    expect(servers.intruder!.received).toEqual([]);
  });
});
