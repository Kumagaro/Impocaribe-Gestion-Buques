// T026 · Fixtures de extremo a extremo (plan §11.2): la clase de dispositivo del proyecto, un segundo usuario en otro
// contexto del navegador y consultas directas a la base para comprobar el efecto real en el servidor.
import { test as base, type BrowserContextOptions, type Page } from '@playwright/test';
import pg from 'pg';
import { e2eDatabaseUrl, SERVER_URL } from './env';

type DeviceClass = 'phone' | 'tablet' | 'desktop';

interface Fixtures {
  device: DeviceClass;
  /** Abre una ruta de la app (router por hash) con la clase de dispositivo del proyecto (?device=, plan §7.3). */
  openApp: (path?: string, page?: Page) => Promise<Page>;
  /** Página de otro usuario, en su propio contexto (cookies y almacenamiento aparte). */
  otherUser: Page;
  /** Consulta directa a la base de extremo a extremo, como superusuario de la prueba. */
  sql: <T extends pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<T[]>;
  serverUrl: string;
}

let pool: pg.Pool | null = null;

export const test = base.extend<Fixtures>({
  device: async ({}, use, testInfo) => {
    await use(testInfo.project.metadata.device as DeviceClass);
  },
  openApp: async ({ page, device, baseURL }, use) => {
    await use(async (path = '/', target = page) => {
      const url = new URL('/', baseURL);
      url.searchParams.set('device', device);
      url.hash = path;
      await target.goto(url.toString());
      return target;
    });
  },
  otherUser: async ({ browser }, use, testInfo) => {
    // Mismo dispositivo que el proyecto (viewport, táctil); el resto del contexto, nuevo.
    const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
    await use(await context.newPage());
    await context.close();
  },
  sql: async ({}, use) => {
    pool ??= new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2 });
    await use(async (text, params = []) => (await pool!.query(text, params)).rows);
  },
  serverUrl: async ({}, use) => {
    await use(SERVER_URL);
  },
});

export { expect } from '@playwright/test';
