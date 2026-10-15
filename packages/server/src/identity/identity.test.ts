import { ManualClock } from '@impocaribe/shared';
import { createNodeTransport, ServerIdentityError, verifyServerChain } from '@impocaribe/shared/node';
import { createCipheriv, createDecipheriv, randomBytes, X509Certificate } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { createIdentity, IdentityExistsError, loadIdentity, type SecretProtector } from './identity.ts';
import { windowsMachineProtector } from './protector.ts';

// T033 · DT-18 y RF-RED-03: identidad del servidor (UUID y nombre IMPOCARIBE-XXXX), CA propia de la instalación y
// certificado ligado a la identidad, nunca a una IP. Las claves privadas se guardan protegidas (plan §4.2).

/** Protector reversible para las pruebas: el de Windows (DPAPI) se prueba aparte, contra el sistema real. */
const KEY = randomBytes(32);
const testProtector: SecretProtector = {
  async protect(data) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', KEY, iv);
    const body = Buffer.concat([c.update(data), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  },
  async unprotect(data) {
    const d = createDecipheriv('aes-256-gcm', KEY, data.subarray(0, 12));
    d.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([d.update(data.subarray(28)), d.final()]);
  },
};

const clock = new ManualClock('2026-10-15T12:00:00.000Z');
let dir: string;

beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'impocaribe-identity-')), 'identity');
});

afterEach(async () => {
  await rm(join(dir, '..'), { recursive: true, force: true });
});

describe('createIdentity', () => {
  it('genera un UUID, el nombre IMPOCARIBE-XXXX y la huella de la CA', async () => {
    const id = await createIdentity(dir, { protector: testProtector, clock });
    expect(id.serverId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.name).toBe(`IMPOCARIBE-${id.serverId.slice(0, 4).toUpperCase()}`);
    expect(id.caFingerprint).toBe(new X509Certificate(id.caCertPem).fingerprint256);
  });

  it('el certificado lo firma la CA de la instalación y lleva la identidad: el cliente lo acepta (DT-18)', async () => {
    const id = await createIdentity(dir, { protector: testProtector, clock });
    const chain = [new X509Certificate(id.certPem), new X509Certificate(id.caCertPem)];
    const pair = { identity: id.serverId, caFingerprint: id.caFingerprint };
    expect(verifyServerChain(chain, pair, new Date('2026-10-15T12:00:00.000Z'))).toEqual({ ok: true });
    // Sigue valiendo durante la vida útil del servidor.
    expect(verifyServerChain(chain, pair, new Date('2045-10-15T12:00:00.000Z'))).toEqual({ ok: true });
  });

  it('el certificado no contiene ninguna IP: solo el nombre de la identidad', async () => {
    const id = await createIdentity(dir, { protector: testProtector, clock });
    const leaf = new X509Certificate(id.certPem);
    expect(leaf.subjectAltName).toBe(`DNS:${id.serverId}.impocaribe`);
    expect(`${leaf.subject}\n${leaf.subjectAltName}`).not.toMatch(/IP Address|\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  it('la CA es una autoridad y el certificado del servidor no puede firmar otros', async () => {
    const id = await createIdentity(dir, { protector: testProtector, clock });
    expect([new X509Certificate(id.caCertPem).ca, new X509Certificate(id.certPem).ca]).toEqual([true, false]);
  });

  it('las claves privadas no quedan en claro en el disco', async () => {
    await createIdentity(dir, { protector: testProtector, clock });
    const files = await readdir(dir);
    const contents = await Promise.all(files.map((f) => readFile(join(dir, f), 'latin1')));
    expect(files.sort()).toEqual(['ca.crt', 'ca.key.protected', 'identity.json', 'server.crt', 'server.key.protected']);
    expect(contents.filter((c) => c.includes('PRIVATE KEY'))).toEqual([]);
  });

  it('loadIdentity devuelve la misma identidad, con las claves descifradas', async () => {
    const created = await createIdentity(dir, { protector: testProtector, clock });
    const loaded = await loadIdentity(dir, testProtector);
    expect(loaded).toEqual(created);
    expect(loaded.keyPem).toContain('BEGIN PRIVATE KEY');
  });
});

describe('regenerar la identidad', () => {
  it('sin la acción explícita del ayudante es imposible: la identidad anterior queda intacta', async () => {
    const first = await createIdentity(dir, { protector: testProtector, clock });
    await expect(createIdentity(dir, { protector: testProtector, clock })).rejects.toThrow(IdentityExistsError);
    await expect(createIdentity(dir, { protector: testProtector, clock })).rejects.toThrow(
      `Ya existe la identidad del servidor ${first.name}. Solo el ayudante de instalación puede reemplazarla.`,
    );
    expect((await loadIdentity(dir, testProtector)).serverId).toBe(first.serverId);
  });

  it('con la acción explícita del ayudante se reemplaza, y la anterior se conserva aparte', async () => {
    const first = await createIdentity(dir, { protector: testProtector, clock });
    const second = await createIdentity(dir, { protector: testProtector, clock, replaceByInstaller: true });
    expect(second.serverId).not.toBe(first.serverId);
    expect((await loadIdentity(dir, testProtector)).serverId).toBe(second.serverId);
    const kept = await loadIdentity(join(dir, '..', 'identity.replaced-20261015T120000Z'), testProtector);
    expect(kept.serverId).toBe(first.serverId);
  });
});

describe('el servidor arranca con su identidad (HTTPS)', () => {
  it('el cliente que la aprendió al emparejarse llega; uno que espera otra identidad se rechaza', async () => {
    const id = await createIdentity(dir, { protector: testProtector, clock });
    const { createServer } = await import('node:https');
    const server = createServer({ key: id.keyPem, cert: id.certPem + id.caCertPem }, (_req, res) => res.end('ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    onTestFinished(() => void server.close());
    const port = (server.address() as { port: number }).port;
    const good = createNodeTransport({ identity: id.serverId, caFingerprint: id.caFingerprint });
    const res = await good(`https://127.0.0.1:${port}/`, { method: 'GET' });
    expect([res.status, await res.text()]).toEqual([200, 'ok']);
    const other = createNodeTransport({
      identity: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
      caFingerprint: id.caFingerprint,
    });
    await expect(other(`https://127.0.0.1:${port}/`, { method: 'GET' })).rejects.toThrow(ServerIdentityError);
  });
});

describe('windowsMachineProtector (protección de datos de Windows para la máquina)', () => {
  it('en Windows cifra de forma reversible; fuera de Windows se niega con un mensaje claro', async () => {
    const protector = windowsMachineProtector();
    const secret = Buffer.from('-----BEGIN PRIVATE KEY-----prueba');
    if (process.platform === 'win32') {
      const sealed = await protector.protect(secret);
      expect([sealed.includes(secret), (await protector.unprotect(sealed)).equals(secret)]).toEqual([false, true]);
    } else {
      await expect(protector.protect(secret)).rejects.toThrow(
        'La protección de datos de Windows solo existe en Windows: el servidor de producción corre en Windows.',
      );
    }
  });
});
