// Prepara una vez por ejecución la plantilla de pruebas (TEST_DATABASE_URL): la borra, la crea y la migra.
import pg from 'pg';
import { config } from '../src/config.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { adminUrl } from './suite-db.ts';

export default async function setup(): Promise<void> {
  const { databaseUrl } = config();
  const name = new URL(databaseUrl).pathname.slice(1);
  const c = new pg.Client({ connectionString: adminUrl(databaseUrl) });
  await c.connect();
  try {
    await c.query(`DROP DATABASE IF EXISTS ${c.escapeIdentifier(name)} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${c.escapeIdentifier(name)}`);
  } finally {
    await c.end();
  }
  await runMigrations(databaseUrl);
}
