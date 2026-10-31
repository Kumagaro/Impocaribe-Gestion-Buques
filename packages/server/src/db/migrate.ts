import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** La versión del esquema de este servidor: cuántas migraciones trae (las aplica al arrancar). */
export function schemaVersion(): number {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as {
    entries: unknown[];
  };
  return journal.entries.length;
}

/** Aplica las migraciones pendientes con el dueño del esquema (no con el rol de la app). */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
