import { ManualClock } from '@impocaribe/shared';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIdentity, type SecretProtector } from './identity.ts';
import { serverTls } from './tls.ts';

// T033: el servidor arranca con su identidad. En producción sin identidad no arranca (Const. art. X.2: todo por HTTPS);
// en desarrollo y pruebas, sin identidad sirve HTTP para el navegador de desarrollo y las pruebas de extremo a extremo.
const protector: SecretProtector = { protect: async (d) => d, unprotect: async (d) => d };
const clock = new ManualClock('2026-10-15T12:00:00.000Z');
let dir: string;

beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'impocaribe-tls-')), 'identity');
});

afterEach(async () => {
  await rm(join(dir, '..'), { recursive: true, force: true });
});

describe('serverTls', () => {
  it('con identidad sirve HTTPS con el certificado y la cadena hasta la CA', async () => {
    const id = await createIdentity(dir, { protector, clock });
    expect(await serverTls({ env: 'production', identityDir: dir }, protector)).toEqual({
      key: id.keyPem,
      cert: id.certPem + id.caCertPem,
    });
  });

  it('en producción, sin identidad, no arranca y dice cómo resolverlo', async () => {
    await expect(serverTls({ env: 'production', identityDir: dir }, protector)).rejects.toThrow(
      `Falta la identidad del servidor en ${dir}. Créela o repárela con el ayudante de instalación.`,
    );
  });

  it.each(['development', 'test'] as const)('en %s, sin identidad, sirve HTTP', async (env) => {
    expect(await serverTls({ env, identityDir: dir }, protector)).toBeNull();
  });
});
