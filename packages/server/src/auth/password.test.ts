import { describe, expect, it } from 'vitest';
import { hashSecret, verifySecret } from './password.ts';

// T027 · plan §9 y Const. art. X.1: contraseñas (y códigos de recuperación) con argon2id, 64 MB y 3 iteraciones.
describe('hashSecret / verifySecret', () => {
  it('usa argon2id con los parámetros del plan y una sal propia', async () => {
    const hash = await hashSecret('contraseña1');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(hash).not.toContain('contraseña1');
  });

  it('dos hashes de la misma contraseña son distintos (sal aleatoria)', async () => {
    expect(await hashSecret('contraseña1')).not.toBe(await hashSecret('contraseña1'));
  });

  it('verifica la contraseña correcta y rechaza una distinta', async () => {
    const hash = await hashSecret('contraseña1');
    expect([await verifySecret(hash, 'contraseña1'), await verifySecret(hash, 'contraseña2')]).toEqual([true, false]);
  });

  it('un hash con otro formato no verifica nada', async () => {
    expect(await verifySecret('texto-plano', 'texto-plano')).toBe(false);
  });
});
