// T004: pnpm db:create | db:migrate | db:reset | db:seed sobre la base del entorno actual (NODE_ENV).
import { mkdirSync } from 'node:fs';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import pg from 'pg';
import { hashSecret } from '../auth/password.ts';
import { config } from '../config.ts';
import { runMigrations as migrateDb } from './migrate.ts';

const cfg = config();
const dbName = new URL(cfg.databaseUrl).pathname.slice(1);

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
  await migrateDb(cfg.databaseUrl);
  console.log(`Migraciones aplicadas en ${dbName}`);
}

async function reset() {
  if (cfg.env === 'production') throw new Error('db:reset no está permitido en production: borraría los datos reales.');
  await withAdmin((c) => c.query(`DROP DATABASE IF EXISTS ${c.escapeIdentifier(dbName)} WITH (FORCE)`));
  await create();
  await runMigrations();
  await installationCode();
}

/**
 * RF-CFG-04 en desarrollo: guarda el hash de IMPOCARIBE_INSTALL_CODE (.env), para poder cambiarlo desde P-23. En
 * producción lo guarda el ayudante de instalación (T126); reset no llega aquí en producción.
 */
async function installationCode() {
  const raw = process.env.IMPOCARIBE_INSTALL_CODE;
  if (!raw) return console.log('Sin IMPOCARIBE_INSTALL_CODE: el servidor queda sin código de instalación.');
  const code = installationCodeSchema.safeParse(raw);
  if (!code.success)
    throw new Error(`IMPOCARIBE_INSTALL_CODE no tiene la forma XXXX-XXXX-XXXX: ${code.error.issues[0]!.message}`);
  const client = new pg.Client({ connectionString: cfg.databaseUrl });
  await client.connect();
  try {
    await client.query('UPDATE system_settings SET installation_code_hash = $1', [await hashSecret(code.data)]);
  } finally {
    await client.end();
  }
  console.log('Código de instalación de desarrollo guardado.');
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
