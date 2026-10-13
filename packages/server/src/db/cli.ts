// T004: pnpm db:create | db:migrate | db:reset | db:seed sobre la base del entorno actual (NODE_ENV).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config.ts';

const cfg = config();
const dbName = new URL(cfg.databaseUrl).pathname.slice(1);
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Ejecuta `fn` conectado a la base de mantenimiento `postgres` del mismo servidor. */
async function withAdmin(fn: (c: pg.Client) => Promise<unknown>) {
  const url = new URL(cfg.databaseUrl);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function create() {
  await withAdmin(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) await c.query(`CREATE DATABASE ${c.escapeIdentifier(dbName)}`);
  });
  mkdirSync(cfg.dataDir, { recursive: true });
  console.log(`Base ${dbName} lista; carpeta de datos ${cfg.dataDir}`);
}

async function runMigrations() {
  const pool = new pg.Pool({ connectionString: cfg.databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
  console.log(`Migraciones aplicadas en ${dbName}`);
}

async function reset() {
  if (cfg.env === 'production') throw new Error('db:reset no está permitido en production: borraría los datos reales.');
  await withAdmin((c) => c.query(`DROP DATABASE IF EXISTS ${c.escapeIdentifier(dbName)} WITH (FORCE)`));
  await create();
  await runMigrations();
}

async function seed() {
  if (cfg.env !== 'development') throw new Error('db:seed solo se ejecuta en development: son datos sintéticos.');
  // shortcut: aún no hay tablas; los datos sintéticos se añaden con cada tabla a partir de T012.
  console.log('Sin datos sintéticos todavía: las tablas llegan con la fase F0 (T012).');
}

const commands: Record<string, () => Promise<void>> = { create, migrate: runMigrations, reset, seed };
const command = commands[process.argv[2] ?? ''];
if (!command) {
  console.error(`Uso: node src/db/cli.ts <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}
await command();
