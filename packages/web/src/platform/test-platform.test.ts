import { describe, expect, it } from 'vitest';
import { getPlatform, setPlatform } from './platform';
import { createTestPlatform } from './test-platform';

// T019 · DT-03 y plan §7.1: la app solo habla con el sistema a través de `platform`. La implementación de prueba usa
// SQLite real en memoria (sql.js), la misma base de datos que usan las apps (SQLite), para no simular la copia local.
describe('implementación de prueba de platform', () => {
  it('deviceInfo devuelve la plataforma, la versión y el ancho mínimo de pantalla configurados', async () => {
    const platform = await createTestPlatform({
      deviceInfo: { platform: 'android', appVersion: '1.2.0', smallestWidthDp: 600 },
    });
    expect(platform.deviceInfo()).toEqual({ platform: 'android', appVersion: '1.2.0', smallestWidthDp: 600 });
  });

  it('por defecto es un escritorio Windows con la versión 0.0.0', async () => {
    const platform = await createTestPlatform();
    expect(platform.deviceInfo()).toEqual({ platform: 'windows', appVersion: '0.0.0', smallestWidthDp: 768 });
  });

  it('openDatabase es una base SQLite real: crea, inserta y consulta', async () => {
    const db = await (await createTestPlatform()).openDatabase('copia-local');
    await db.execute('CREATE TABLE dm (id TEXT PRIMARY KEY, saldo TEXT)');
    await db.execute('INSERT INTO dm VALUES (?, ?), (?, ?)', ['00431', '593.050', '00439', '235.780']);
    expect(await db.query('SELECT id, saldo FROM dm ORDER BY id')).toEqual([
      { id: '00431', saldo: '593.050' },
      { id: '00439', saldo: '235.780' },
    ]);
  });

  it('una transacción que falla no deja cambios', async () => {
    const db = await (await createTestPlatform()).openDatabase('copia-local');
    await db.execute('CREATE TABLE dm (id TEXT PRIMARY KEY)');
    await expect(
      db.transaction(async (tx) => {
        await tx.execute('INSERT INTO dm VALUES (?)', ['00431']);
        throw new Error('se cortó la sincronización');
      }),
    ).rejects.toThrow('se cortó la sincronización');
    expect(await db.query('SELECT id FROM dm')).toEqual([]);
  });

  it('una transacción correcta confirma sus cambios y devuelve su resultado', async () => {
    const db = await (await createTestPlatform()).openDatabase('copia-local');
    await db.execute('CREATE TABLE dm (id TEXT PRIMARY KEY)');
    const n = await db.transaction(async (tx) => {
      await tx.execute('INSERT INTO dm VALUES (?)', ['00431']);
      return (await tx.query<{ n: number }>('SELECT count(*) AS n FROM dm'))[0]!.n;
    });
    expect(n).toBe(1);
    expect(await db.query('SELECT id FROM dm')).toEqual([{ id: '00431' }]);
  });

  it('cada base abierta es independiente', async () => {
    const platform = await createTestPlatform();
    const a = await platform.openDatabase('copia-local');
    const b = await platform.openDatabase('borradores');
    await a.execute('CREATE TABLE t (x INTEGER)');
    await expect(b.query('SELECT * FROM t')).rejects.toThrow('no such table: t');
  });

  it('secureStorage guarda, lee y borra valores', async () => {
    const { secureStorage } = await createTestPlatform();
    expect(await secureStorage.get('token')).toBeNull();
    await secureStorage.set('token', 'abc');
    expect(await secureStorage.get('token')).toBe('abc');
    await secureStorage.remove('token');
    expect(await secureStorage.get('token')).toBeNull();
  });

  it('notify, saveFile, secureScreen e installUpdate quedan registrados para que las pruebas los comprueben', async () => {
    const platform = await createTestPlatform();
    await platform.notify({ title: 'Alerta nueva', body: 'Revise la app' });
    await platform.saveFile('EAGLE1-2026-V1-0001.pdf', new Uint8Array([37, 80, 68, 70]));
    await platform.secureScreen(true);
    await platform.installUpdate('https://servidor/updates/android/1.2.0/download');
    expect(platform.calls).toEqual([
      { method: 'notify', args: [{ title: 'Alerta nueva', body: 'Revise la app' }] },
      { method: 'saveFile', args: ['EAGLE1-2026-V1-0001.pdf', new Uint8Array([37, 80, 68, 70])] },
      { method: 'secureScreen', args: [true] },
      { method: 'installUpdate', args: ['https://servidor/updates/android/1.2.0/download'] },
    ]);
  });
});

describe('registro de la plataforma activa', () => {
  it('sin plataforma registrada falla con un mensaje claro', () => {
    setPlatform(null);
    expect(() => getPlatform()).toThrow(
      'No hay plataforma registrada: el cascarón (Electron o Android) debe registrarla al arrancar.',
    );
  });

  it('devuelve la plataforma registrada', async () => {
    const platform = await createTestPlatform();
    setPlatform(platform);
    expect(getPlatform()).toBe(platform);
    setPlatform(null);
  });
});
