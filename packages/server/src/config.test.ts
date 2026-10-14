import { relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

// T004 (plan §13.2): configuración por entorno; las pruebas usan una base aparte que nunca toca la de desarrollo.
const DEV_URL = 'postgres://postgres:x@localhost:5432/impocaribe_dev';
const TEST_URL = 'postgres://postgres:x@localhost:5432/impocaribe_test';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('loadConfig', () => {
  it('sin NODE_ENV usa development, el puerto 8443 del plan §6 y DATABASE_URL', () => {
    const c = loadConfig({ DATABASE_URL: DEV_URL });
    expect(c.env).toBe('development');
    expect(c.port).toBe(8443);
    expect(c.databaseUrl).toBe(DEV_URL);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging', DATABASE_URL: DEV_URL })).toThrow(
      'NODE_ENV inválido: "staging". Use development, test o production.',
    );
  });

  it('en test usa TEST_DATABASE_URL y nunca DATABASE_URL', () => {
    const c = loadConfig({ NODE_ENV: 'test', DATABASE_URL: DEV_URL, TEST_DATABASE_URL: TEST_URL });
    expect(c.databaseUrl).toBe(TEST_URL);
  });

  it('en test exige TEST_DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', DATABASE_URL: DEV_URL })).toThrow(
      'Falta TEST_DATABASE_URL (vea .env.example).',
    );
  });

  it('en test rechaza una base cuyo nombre no termina en _test', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', TEST_DATABASE_URL: DEV_URL })).toThrow(
      'En test la base debe terminar en "_test" y fuera de test no puede terminar así (base: impocaribe_dev).',
    );
  });

  it('fuera de test rechaza una base de pruebas', () => {
    expect(() => loadConfig({ DATABASE_URL: TEST_URL })).toThrow(
      'En test la base debe terminar en "_test" y fuera de test no puede terminar así (base: impocaribe_test).',
    );
  });

  it('la carpeta de datos de desarrollo por defecto está fuera del repositorio', () => {
    const c = loadConfig({ DATABASE_URL: DEV_URL, LOCALAPPDATA: join('C:', 'Users', 'u', 'AppData', 'Local') });
    const rel = relative(repoRoot, c.dataDir);
    expect(rel.startsWith('..') || isAbsolute(rel)).toBe(true);
    expect(c.dataDir).toBe(join('C:', 'Users', 'u', 'AppData', 'Local', 'Impocaribe', 'dev-data'));
  });

  it('en producción la carpeta de datos por defecto es C:\\ProgramData\\Impocaribe\\data (plan §10.3)', () => {
    const c = loadConfig({ NODE_ENV: 'production', DATABASE_URL: DEV_URL, ProgramData: 'C:\\ProgramData' });
    expect(c.dataDir).toBe(join('C:\\ProgramData', 'Impocaribe', 'data'));
  });

  it('IMPOCARIBE_DATA_DIR y PORT tienen prioridad', () => {
    const c = loadConfig({ DATABASE_URL: DEV_URL, IMPOCARIBE_DATA_DIR: 'D:\\datos', PORT: '9443' });
    expect(c.dataDir).toBe('D:\\datos');
    expect(c.port).toBe(9443);
  });
});

describe('DT-11: versión mínima de la app', () => {
  it('por defecto no exige versión mínima (0.0.0) hasta que se publique una', () => {
    expect(loadConfig({ DATABASE_URL: DEV_URL }).minAppVersion).toBe('0.0.0');
  });

  it('MIN_APP_VERSION fija la versión mínima', () => {
    expect(loadConfig({ DATABASE_URL: DEV_URL, MIN_APP_VERSION: '1.2.0' }).minAppVersion).toBe('1.2.0');
  });
});
