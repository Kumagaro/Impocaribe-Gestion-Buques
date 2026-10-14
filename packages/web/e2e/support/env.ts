// T026 · Entorno de las pruebas de extremo a extremo y visuales: navegador fijo, puertos y base propia.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
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
export const STORYBOOK_PORT = 6106;
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}/api/v1`;

/** Base propia de las pruebas de extremo a extremo: se borra y se migra en cada ejecución. */
export function e2eDatabaseUrl(): string {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error('Falta TEST_DATABASE_URL (vea .env.example).');
  const url = new URL(base);
  url.pathname = '/impocaribe_e2e_test';
  return url.toString();
}
