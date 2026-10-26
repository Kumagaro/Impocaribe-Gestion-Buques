import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { downloadUpdate, installerPath, resolveUpdate, UpdateError } from './updater.ts';

// T117 · RF-UPD-05: la actualización se descarga del servidor emparejado, con su progreso, y solo se queda si su
// SHA-256 es el publicado. Certificados de prueba de shared.
const read = (name: string) => readFileSync(new URL(`../../../shared/test-certs/${name}`, import.meta.url));
const SERVER = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: new X509Certificate(read('ca.crt')).fingerprint256,
};
const INSTALLER = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300_000, 7)]);
const SHA = createHash('sha256').update(INSTALLER).digest('hex');

let good: Server;
let intruder: Server;
let base = '';
let intruderBase = '';

const start = async (cert: string, key: string, ca: string) => {
  const server = createServer({ cert: Buffer.concat([read(cert), read(ca)]), key: read(key) }, (req, res) => {
    if (req.url !== '/api/v1/updates/windows/1.4.0/download') return void res.writeHead(404).end();
    res.writeHead(200, { 'Content-Length': String(INSTALLER.length) });
    res.end(INSTALLER);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `https://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

beforeAll(async () => {
  ({ server: good, url: base } = await start('server.crt', 'server.key', 'ca.crt'));
  ({ server: intruder, url: intruderBase } = await start('intruder.crt', 'intruder.key', 'rogue-ca.crt'));
});
afterAll(async () => {
  await Promise.all([good, intruder].map((s) => new Promise((r) => s.close(r))));
});

const dir = () => mkdtempSync(join(tmpdir(), 'impocaribe-update-'));

describe('downloadUpdate', () => {
  it('descarga con su progreso y deja el instalador con la huella publicada', async () => {
    const file = installerPath(dir(), '1.4.0');
    const progress: [number, number][] = [];
    const path = await downloadUpdate(`${base}/api/v1/updates/windows/1.4.0/download`, SERVER, SHA, file, (r, t) =>
      progress.push([r, t]),
    );
    expect(path).toBe(file);
    expect(readFileSync(file).equals(INSTALLER)).toBe(true);
    expect(progress.at(-1)).toEqual([INSTALLER.length, INSTALLER.length]);
    expect(progress.length).toBeGreaterThan(1);
    expect(existsSync(`${file}.part`)).toBe(false);
  });

  it('si la huella no es la publicada, no se queda nada', async () => {
    const file = installerPath(dir(), '1.4.0');
    await expect(
      downloadUpdate(`${base}/api/v1/updates/windows/1.4.0/download`, SERVER, 'f'.repeat(64), file),
    ).rejects.toEqual(new UpdateError('El archivo descargado no coincide con el publicado: no se instala.'));
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}.part`)).toBe(false);
  });

  it('de un intruso no se descarga nada, y otro estado se explica', async () => {
    const file = installerPath(dir(), '1.4.0');
    await expect(
      downloadUpdate(`${intruderBase}/api/v1/updates/windows/1.4.0/download`, SERVER, SHA, file),
    ).rejects.toThrow('La autoridad de certificación no es la de este servidor');
    expect(existsSync(file)).toBe(false);
    await expect(downloadUpdate(`${base}/api/v1/updates/windows/9.9.9/download`, SERVER, SHA, file)).rejects.toEqual(
      new UpdateError('El servidor no entregó la actualización (estado 404).'),
    );
  });

  it('el nombre del instalador lo pone la app, con una versión válida', () => {
    expect(() => installerPath('C:/x', '../../evil')).toThrow('Versión no válida: ../../evil');
    expect(installerPath('C:/x', '1.4.0')).toBe(join('C:/x', 'impocaribe-1.4.0.exe'));
  });
});

describe('resolveUpdate (qué descargar lo decide el proceso principal)', () => {
  const pairing = JSON.stringify({ ...SERVER, lastAddress: { address: '192.168.1.20', port: 8443 } });
  const published = async () => ({ latest: '1.4.0', sha256: SHA });

  it('dirección y servidor del emparejamiento guardado; huella pedida al servidor', async () => {
    const asked: [string, unknown][] = [];
    const r = await resolveUpdate('1.4.0', '1.3.0', pairing, async (url, server) => {
      asked.push([url, server]);
      return published();
    });
    expect(asked).toEqual([['https://192.168.1.20:8443/api/v1/updates/check?platform=windows&version=1.3.0', SERVER]]);
    expect(r).toEqual({
      url: 'https://192.168.1.20:8443/api/v1/updates/windows/1.4.0/download',
      sha256: SHA,
      server: SERVER,
    });
  });

  it.each([
    ['../../evil', pairing, published, 'Versión no válida: ../../evil'],
    ['1.3.0', pairing, published, 'La 1.3.0 no es más nueva que la instalada (1.3.0).'],
    ['1.4.0', null, published, 'Este equipo no está emparejado con el servidor: no se puede actualizar.'],
    [
      '1.4.0',
      pairing,
      async () => ({ latest: '1.5.0', sha256: SHA }),
      'La 1.4.0 no es la versión publicada en el servidor.',
    ],
    [
      '1.4.0',
      pairing,
      async () => ({ latest: '1.4.0', sha256: null }),
      'La 1.4.0 no es la versión publicada en el servidor.',
    ],
  ])('rechaza %s', async (version, stored, check, message) => {
    await expect(resolveUpdate(version, '1.3.0', stored, check)).rejects.toEqual(new UpdateError(message));
  });
});
