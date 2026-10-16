// T026 · Entorno de las pruebas de extremo a extremo y visuales: navegador fijo, puertos y base propia.
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}

/** Chrome for Testing fijo (plan §10.7): la misma versión renderiza igual y las referencias visuales no bailan. */
export const CHROME_VERSION = '155.0.8059.39';

export function chromePath(): string {
  const path =
    process.env.E2E_CHROME ??
    join(
      homedir(),
      '.cache/puppeteer/chrome-headless-shell',
      `win64-${CHROME_VERSION}`,
      'chrome-headless-shell-win64/chrome-headless-shell.exe',
    );
  if (!existsSync(path)) {
    throw new Error(
      `No está Chrome for Testing ${CHROME_VERSION} en ${path}. Instálelo con ` +
        `"npx @puppeteer/browsers@3.2.5 install chrome-headless-shell@${CHROME_VERSION} --path ~/.cache/puppeteer" o indique su ruta en E2E_CHROME.`,
    );
  }
  return path;
}

export const SERVER_PORT = 8444;
export const WEB_PORT = 5199;
// Fuera de los intervalos que Windows reserva para Hyper-V (6094-6193 en este equipo; cambian al reiniciar).
export const STORYBOOK_PORT = 5198;
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}/api/v1`;

/** Base propia de las pruebas de extremo a extremo: se borra y se migra en cada ejecución. */
export function e2eDatabaseUrl(): string {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error('Falta TEST_DATABASE_URL (vea .env.example).');
  const url = new URL(base);
  url.pathname = '/impocaribe_e2e_test';
  return url.toString();
}

/** Identidad pública del servidor de la prueba (sin claves: sirve HTTP, IMPOCARIBE_TLS=off). */
export const E2E_IDENTITY = {
  serverId: '0e2e0000-0000-4000-8000-000000000001',
  name: 'IMPOCARIBE-0E2E',
  caFingerprint: 'E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2:E2',
};
export const E2E_IDENTITY_DIR = join(tmpdir(), 'impocaribe-e2e-identity');

/** Lo que el primer arranque deja para las demás pruebas: usuarios por clase de dispositivo y sus códigos. */
export const E2E_STATE_FILE = join(tmpdir(), 'impocaribe-e2e-state.json');
