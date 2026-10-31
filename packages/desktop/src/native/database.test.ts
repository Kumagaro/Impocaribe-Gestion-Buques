import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowed, LocalDatabases } from './database.ts';
import { SecureStore, type Cipher } from './secure-storage.ts';

// T115 · DT-03 (SQLCipher en escritorio): la copia local se guarda cifrada con una clave aleatoria del almacenamiento
// seguro, y el SQL que llega de la interfaz no puede salir de la base.
const cipher: Cipher = {
  encryptString: (v) => Buffer.from(v, 'utf8').reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString('utf8'),
};
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'impocaribe-db-'));
  const secure = new SecureStore(join(dir, 'secure.json'), cipher);
  return { dir, secure, dbs: new LocalDatabases(dir, secure) };
};

describe('LocalDatabases (SQLCipher)', () => {
  it('crea la clave la primera vez, guarda cifrado y vuelve a abrir con la misma clave', async () => {
    const { dir, secure, dbs } = setup();
    const id = await dbs.openDatabase('impocaribe');
    const key = secure.get('impocaribe.db-key.impocaribe');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    dbs.execute(id, 'CREATE TABLE orden (numero TEXT, pdf BLOB)');
    dbs.execute(id, 'PRAGMA user_version = 3');
    dbs.execute(id, 'INSERT INTO orden VALUES (?, ?)', ['EAGLE1-2026-V1-0042', new Uint8Array([37, 80, 68, 70])]);
    dbs.closeAll();

    // En disco no hay nada legible: ni la cabecera de SQLite ni el número de la orden.
    const raw = readFileSync(join(dir, 'impocaribe.db'));
    expect(raw.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
    expect(raw.includes(Buffer.from('EAGLE1-2026-V1-0042'))).toBe(false);

    const again = new LocalDatabases(dir, secure);
    const id2 = await again.openDatabase('impocaribe');
    expect(again.query(id2, 'SELECT numero, pdf FROM orden')).toEqual([
      { numero: 'EAGLE1-2026-V1-0042', pdf: new Uint8Array([37, 80, 68, 70]) },
    ]);
    expect(again.query(id2, 'PRAGMA user_version')).toEqual([{ user_version: 3 }]);
    again.closeAll();
  });

  it('con otra clave el archivo no se abre', async () => {
    const { dir, secure, dbs } = setup();
    const id = await dbs.openDatabase('impocaribe');
    dbs.execute(id, 'CREATE TABLE t (v TEXT)');
    dbs.closeAll();
    await secure.set('impocaribe.db-key.impocaribe', 'cd'.repeat(32));
    await expect(new LocalDatabases(dir, secure).openDatabase('impocaribe')).rejects.toThrow('file is not a database');
  });

  it('un nombre de base es una palabra, no una ruta', async () => {
    const { dbs } = setup();
    await expect(dbs.openDatabase('../fuera')).rejects.toThrow('Nombre de base no válido: ../fuera');
  });

  it.each([
    "ATTACH DATABASE 'C:/Windows/x.db' AS x",
    'DETACH DATABASE x',
    "VACUUM INTO 'C:/Users/Public/copia.db'",
    "SELECT load_extension('evil')",
    "PRAGMA key = 'otra'",
    'PRAGMA cipher_compatibility = 3',
    'PRAGMA user_version = 4; PRAGMA journal_mode = DELETE',
  ])('rechaza «%s»', (sql) => {
    expect(() => allowed(sql)).toThrow('Sentencia no permitida en la copia local.');
  });

  it.each(['PRAGMA user_version', 'PRAGMA user_version = 12', 'SELECT * FROM orden WHERE numero = ?'])(
    'deja pasar «%s»',
    (sql) => {
      expect(() => allowed(sql)).not.toThrow();
    },
  );
});
