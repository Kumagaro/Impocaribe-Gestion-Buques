import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SecureStore, type Cipher } from './secure-storage.ts';

// T115 · plan §9: cada valor va cifrado (safeStorage en la app; aquí, un cifrado de prueba) y sobrevive al reinicio.
const cipher: Cipher = {
  encryptString: (v) => Buffer.from(v, 'utf8').reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString('utf8'),
};

describe('SecureStore', () => {
  it('guarda, lee tras reabrir y borra; en el archivo no queda nada en claro', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'impocaribe-secure-')), 'secure.json');
    const store = new SecureStore(file, cipher);
    expect(store.get('impocaribe.session')).toBeNull();
    await store.set('impocaribe.session', '{"token":"secreto-de-sesion"}');
    await store.set('impocaribe.pairing', '{"deviceSecret":"otro-secreto"}');
    expect(readFileSync(file, 'utf8')).not.toContain('secreto');

    const reopened = new SecureStore(file, cipher);
    expect(reopened.get('impocaribe.session')).toBe('{"token":"secreto-de-sesion"}');
    await reopened.remove('impocaribe.session');
    expect(new SecureStore(file, cipher).get('impocaribe.session')).toBeNull();
    expect(new SecureStore(file, cipher).get('impocaribe.pairing')).toBe('{"deviceSecret":"otro-secreto"}');
  });

  it('escrituras seguidas quedan todas, en orden', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'impocaribe-secure-')), 'secure.json');
    const store = new SecureStore(file, cipher);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.set(`k${i}`, String(i))));
    const reopened = new SecureStore(file, cipher);
    expect(Array.from({ length: 20 }, (_, i) => reopened.get(`k${i}`))).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i)),
    );
  });
});
