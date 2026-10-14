// Base limpia por suite (T012): cada archivo de pruebas de integración trabaja en su propia base, clonada de la plantilla
// migrada por global-setup.ts. Nunca toca la base de desarrollo: config() exige en test una base terminada en _test.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { config } from '../src/config.ts';
import { createAppPool } from '../src/db/db.ts';

export interface SuiteDb {
  name: string;
  url: string;
  /** Conexiones con el rol de la aplicación, como en producción. */
  app: pg.Pool;
  /** Conexión con el dueño del esquema, solo para preparar escenarios. */
  admin: pg.Pool;
  drop(): Promise<void>;
}

export function adminUrl(url: string, database = 'postgres'): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

export async function createSuiteDb(): Promise<SuiteDb> {
  const templateUrl = config().databaseUrl;
  const template = new URL(templateUrl).pathname.slice(1);
  const name = `impocaribe_${randomBytes(6).toString('hex')}_test`;
  const maintenance = new pg.Client({ connectionString: adminUrl(templateUrl) });
  await maintenance.connect();
  try {
    // Varias suites clonan la misma plantilla a la vez: PostgreSQL rechaza el clon mientras otra copia la lee.
    for (let attempt = 1; ; attempt++) {
      try {
        await maintenance.query(
          `CREATE DATABASE ${maintenance.escapeIdentifier(name)} TEMPLATE ${maintenance.escapeIdentifier(template)}`,
        );
        break;
      } catch (err) {
        if (attempt >= 20 || !String(err).includes('is being accessed by other users')) throw err;
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
    }
  } finally {
    await maintenance.end();
  }
  const url = adminUrl(templateUrl, name);
  const app = createAppPool(url);
  const admin = new pg.Pool({ connectionString: url, max: 2 });
  return {
    name,
    url,
    app,
    admin,
    async drop() {
      await Promise.all([app.end(), admin.end()]);
      const c = new pg.Client({ connectionString: adminUrl(templateUrl) });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${c.escapeIdentifier(name)} WITH (FORCE)`);
      await c.end();
    },
  };
}
