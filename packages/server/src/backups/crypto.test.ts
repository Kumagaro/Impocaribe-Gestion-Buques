import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptFile, encryptFile, newKeyPair, openPrivateKey, readMeta, sealPrivateKey } from './crypto.ts';

// T105 · DT-07, RF-RES-04: el cifrado híbrido de los respaldos.
const PASSWORD = 'respaldo de prueba 2026';
const dir = mkdtempSync(join(tmpdir(), 'impocaribe-crypto-'));
const path = (name: string) => join(dir, name);

describe('clave privada sellada con la contraseña de respaldo', () => {
  it('se abre con la contraseña y con otra da BACKUP_PASSWORD_INVALID', async () => {
    const { privateKey } = newKeyPair();
    const sealed = await sealPrivateKey(privateKey, PASSWORD);
    const opened = await openPrivateKey(sealed, PASSWORD);
    expect(opened.export({ type: 'pkcs8', format: 'der' })).toEqual(
      privateKey.export({ type: 'pkcs8', format: 'der' }),
    );
    await expect(openPrivateKey(sealed, 'otra contraseña cualquiera')).rejects.toMatchObject({
      code: 'BACKUP_PASSWORD_INVALID',
      details: { fields: { password: 'La contraseña de respaldo no es correcta.' } },
    });
  });

  it('cambiar la contraseña vuelve a sellar la misma clave: los respaldos anteriores se abren con la nueva', async () => {
    const { publicKey, privateKey } = newKeyPair();
    writeFileSync(path('antes.bin'), 'datos de antes del cambio');
    await encryptFile(path('antes.bin'), path('antes.icbak'), publicKey, { kind: 'manual' });
    const resealed = await sealPrivateKey(
      await openPrivateKey(await sealPrivateKey(privateKey, PASSWORD), PASSWORD),
      'contraseña nueva 2027',
    );
    await decryptFile(path('antes.icbak'), path('antes.out'), await openPrivateKey(resealed, 'contraseña nueva 2027'));
    expect(readFileSync(path('antes.out'), 'utf8')).toBe('datos de antes del cambio');
  });
});

describe('archivos .icbak', () => {
  it('ida y vuelta de un archivo grande, con la cabecera legible sin la contraseña', async () => {
    const { publicKey, privateKey } = newKeyPair();
    const data = randomBytes(3 * 1024 * 1024 + 7);
    writeFileSync(path('big.bin'), data);
    await encryptFile(path('big.bin'), path('big.icbak'), publicKey, {
      kind: 'hourly',
      createdAt: '2026-10-23T14:00:00.000Z',
    });
    expect(readFileSync(path('big.icbak')).subarray(0, 7).toString()).toBe('ICBAK1\n');
    expect(readFileSync(path('big.icbak')).includes(data.subarray(0, 64))).toBe(false);
    expect(await readMeta(path('big.icbak'))).toEqual({ kind: 'hourly', createdAt: '2026-10-23T14:00:00.000Z' });
    await decryptFile(path('big.icbak'), path('big.out'), privateKey);
    expect(readFileSync(path('big.out')).equals(data)).toBe(true);
  });

  it('un archivo vacío también', async () => {
    const { publicKey, privateKey } = newKeyPair();
    writeFileSync(path('empty.bin'), '');
    await encryptFile(path('empty.bin'), path('empty.icbak'), publicKey, {});
    await decryptFile(path('empty.icbak'), path('empty.out'), privateKey);
    expect(readFileSync(path('empty.out')).length).toBe(0);
  });

  it('alterado (datos o cabecera) o con la clave de otro servidor: falla y no deja nada escrito', async () => {
    const { publicKey, privateKey } = newKeyPair();
    writeFileSync(path('x.bin'), 'contenido protegido');
    await encryptFile(path('x.bin'), path('x.icbak'), publicKey, { kind: 'manual' });
    const original = readFileSync(path('x.icbak'));

    const flipped = Buffer.from(original);
    flipped[flipped.length - 20]! ^= 1;
    writeFileSync(path('data.icbak'), flipped);
    const headerTampered = Buffer.from(original.toString('latin1').replace('"manual"', '"hourly"'), 'latin1');
    writeFileSync(path('head.icbak'), headerTampered);

    for (const [file, key] of [
      ['data.icbak', privateKey],
      ['head.icbak', privateKey],
      ['x.icbak', newKeyPair().privateKey],
    ] as const) {
      await expect(decryptFile(path(file), path('fail.out'), key)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(existsSync(path('fail.out'))).toBe(false);
    }
    writeFileSync(path('otro.icbak'), 'no es un respaldo');
    await expect(readMeta(path('otro.icbak'))).rejects.toMatchObject({
      message: 'El archivo no es un respaldo de Impocaribe.',
    });
  });
});
