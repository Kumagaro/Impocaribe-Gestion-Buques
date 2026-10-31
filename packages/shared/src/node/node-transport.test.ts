import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeTransport, ServerIdentityError } from './node-transport.ts';

// T021 · DT-19: el transporte verifica la identidad del servidor antes de enviar nada; la IP no se compara.
const read = (name: string) => readFileSync(new URL(`../../test-certs/${name}`, import.meta.url));
const paired = {
  identity: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: new X509Certificate(read('ca.crt')).fingerprint256,
};

const servers: Record<string, { server: Server; url: string; received: number }> = {};

async function start(name: string, cert: string, key: string, caFile: string) {
  const entry = { server: undefined as unknown as Server, url: '', received: 0 };
  entry.server = createServer({ cert: Buffer.concat([read(cert), read(caFile)]), key: read(key) }, (req, res) => {
    entry.received += 1;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const size = Buffer.concat(chunks).length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, auth: req.headers.authorization ?? null, ...(size ? { size } : {}) }));
    });
  });
  await new Promise<void>((resolve) => entry.server.listen(0, '127.0.0.1', resolve));
  entry.url = `https://127.0.0.1:${(entry.server.address() as AddressInfo).port}`;
  servers[name] = entry;
}

beforeAll(async () => {
  await start('good', 'server.crt', 'server.key', 'ca.crt');
  await start('intruder', 'intruder.crt', 'intruder.key', 'rogue-ca.crt');
  await start('other', 'other-identity.crt', 'other-identity.key', 'ca.crt');
});

afterAll(async () => {
  await Promise.all(Object.values(servers).map((s) => new Promise((r) => s.server.close(r))));
});

describe('createNodeTransport', () => {
  it('acepta al servidor emparejado aunque se conecte por una IP que no figura en el certificado', async () => {
    const transport = createNodeTransport(paired);
    const res = await transport(`${servers.good!.url}/api/v1/health`, {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: '/api/v1/health', auth: 'Bearer token' });
  });

  it('envía el cuerpo de una escritura', async () => {
    const transport = createNodeTransport(paired);
    const res = await transport(`${servers.good!.url}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"tons":"17.280"}',
    });
    expect(res.status).toBe(200);
  });

  it('T115: envía un cuerpo en bytes (un archivo en multipart)', async () => {
    const transport = createNodeTransport(paired);
    const res = await transport(`${servers.good!.url}/api/v1/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
      body: new Uint8Array(4096),
    });
    expect(await res.json()).toEqual({ path: '/api/v1/updates', auth: null, size: 4096 });
  });

  it('rechaza a un intruso con otra CA y el intruso no recibe la petición ni el token', async () => {
    const transport = createNodeTransport(paired);
    await expect(
      transport(`${servers.intruder!.url}/api/v1/health`, {
        method: 'GET',
        headers: { Authorization: 'Bearer token' },
      }),
    ).rejects.toEqual(
      new ServerIdentityError('La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.'),
    );
    expect(servers.intruder!.received).toBe(0);
  });

  it('rechaza un servidor de la misma CA con otra identidad, sin enviarle la petición', async () => {
    const transport = createNodeTransport(paired);
    await expect(transport(`${servers.other!.url}/api/v1/health`, { method: 'GET' })).rejects.toEqual(
      new ServerIdentityError('El certificado no corresponde al servidor emparejado.'),
    );
    expect(servers.other!.received).toBe(0);
  });
});
