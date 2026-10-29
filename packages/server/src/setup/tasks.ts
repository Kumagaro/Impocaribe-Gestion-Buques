// T126 · plan §10.3 (pasos 4, 5 y 9): lo que el ayudante le pide al servidor ya copiado, con su propio Node y el entorno
// del servicio (DATABASE_URL y las carpetas): aplicar las migraciones, crear la identidad (si ya hay una, se conserva:
// reemplazarla dejaría huérfanos a los dispositivos) y guardar el montaje de red y la comprobación del código.
//   node dist/setup/tasks.js migrate | identity | settings   (settings lee {network, codeHash} por la entrada)
//   node dist/setup/tasks.js publish-bundled <carpeta publicar>   (T129, al actualizar)
//   node dist/setup/tasks.js prepare-move <archivo> | read-move <archivo> | restore-move <archivo> | server-state
//     (T130, traslado; la contraseña de respaldo por la entrada)
import { readFile } from 'node:fs/promises';
import { stdin } from 'node:process';
import { AppError, systemClock } from '@impocaribe/shared';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { verifySecret } from '../auth/password.ts';
import { config, type Config } from '../config.ts';
import { createAppPool } from '../db/db.ts';
import { prepareMove, readMove, restoreMove } from '../backups/move.ts';
import { readServerState } from '../server-state.ts';
import { publishBundled } from '../updates/bundled.ts';
import { emergencyReset } from './emergency.ts';
import { runMigrations } from '../db/migrate.ts';
import { createIdentity, IdentityExistsError } from '../identity/identity.ts';
import { windowsMachineProtector } from '../identity/protector.ts';

// Solo cuando un comando la necesita: leer un traslado en la PC nueva (read-move) no tiene base todavía.
let loaded: Config | undefined;
const cfg = () => (loaded ??= config());

async function input(): Promise<string> {
  let text = '';
  for await (const chunk of stdin) text += String(chunk);
  return text;
}

const moveDeps = () => ({
  databaseUrl: cfg().databaseUrl,
  pgBin: process.env.IMPOCARIBE_PG_BIN ?? '',
  dataDir: cfg().dataDir,
  identityDir: cfg().identityDir,
  protector: windowsMachineProtector(),
});

/** Un error de negocio sale como «CÓDIGO: mensaje» con el código de salida 3, para que el ayudante lo muestre tal cual. */
function failed(err: unknown): string {
  process.exitCode = 3;
  return err instanceof AppError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
}

const commands: Record<string, () => Promise<string>> = {
  async migrate() {
    await runMigrations(cfg().databaseUrl);
    return 'Estructura de los datos al día.';
  },
  async identity() {
    try {
      const identity = await createIdentity(cfg().identityDir, {
        protector: windowsMachineProtector(),
        clock: { now: () => new Date() },
      });
      return JSON.stringify({ created: true, name: identity.name });
    } catch (err) {
      if (!(err instanceof IdentityExistsError)) throw err;
      const meta = JSON.parse(await readFile(`${cfg().identityDir}/identity.json`, 'utf8')) as { name: string };
      return JSON.stringify({ created: false, name: meta.name });
    }
  },
  async settings() {
    const { network, codeHash } = JSON.parse(await input()) as { network: 'router' | 'hotspot'; codeHash: string };
    if (network !== 'router' && network !== 'hotspot')
      throw new Error(`Montaje de red desconocido: ${String(network)}`);
    if (!codeHash.startsWith('$argon2id$')) throw new Error('La comprobación del código de instalación no es válida.');
    const client = new pg.Client({ connectionString: cfg().databaseUrl });
    await client.connect();
    try {
      await client.query('UPDATE system_settings SET network_setup = $1, installation_code_hash = $2', [
        network,
        codeHash,
      ]);
    } finally {
      await client.end();
    }
    return 'Montaje de red y código de instalación guardados.';
  },
  /** T129 · RF-UPD-01: publica el instalador ligero y el APK que trae el instalador completo (carpeta publicar). */
  async 'publish-bundled'() {
    const dir = process.argv[3];
    if (!dir) throw new Error('Falta la carpeta publicar.');
    const pool = createAppPool(cfg().databaseUrl);
    try {
      return (await publishBundled(drizzle(pool), systemClock, cfg().dataDir, dir)).join('\n');
    } finally {
      await pool.end();
    }
  },
  /** T130 · D14: «active» o «migrated» (el ayudante no repara ni arranca un servidor trasladado). */
  async 'server-state'() {
    return (await readServerState(cfg().databaseUrl)) ?? 'active';
  },
  /** T130 · RF-INS-07: el archivo de traslado en la carpeta del argumento; la contraseña de respaldo, por la entrada. */
  async 'prepare-move'() {
    const dest = process.argv[3];
    if (!dest) throw new Error('Falta dónde guardar el archivo de traslado.');
    const pool = createAppPool(cfg().databaseUrl);
    try {
      const meta = await prepareMove(
        { ...moveDeps(), db: drizzle(pool), clock: systemClock },
        { dest, password: (await input()).trim() },
      );
      return JSON.stringify({ serverName: meta.serverName, devices: meta.devices });
    } catch (err) {
      return failed(err);
    } finally {
      await pool.end();
    }
  },
  /** T130 · P-28, sin base: de qué servidor es el archivo y si la contraseña lo abre. */
  async 'read-move'() {
    try {
      const meta = await readMove(process.argv[3] ?? '', (await input()).trim());
      return JSON.stringify({ serverName: meta.serverName, createdAt: meta.createdAt, devices: meta.devices });
    } catch (err) {
      return failed(err);
    }
  },
  /** T130: en la PC nueva, la base (vacía), los archivos y la identidad del archivo de traslado. */
  async 'restore-move'() {
    try {
      const meta = await restoreMove(moveDeps(), { file: process.argv[3] ?? '', password: (await input()).trim() });
      return `Restaurado el servidor ${meta.serverName} con ${meta.devices} dispositivos emparejados.`;
    } catch (err) {
      return failed(err);
    }
  },
  /** RF-INS-11: lee {code, username, password} por la entrada (emergency.ts). */
  async 'emergency-reset'() {
    const request = JSON.parse(await input()) as { code?: unknown; username?: unknown; password?: unknown };
    const pool = createAppPool(cfg().databaseUrl);
    try {
      await emergencyReset(drizzle(pool), systemClock, {
        code: String(request.code ?? ''),
        username: String(request.username ?? ''),
        password: String(request.password ?? ''),
      });
    } catch (err) {
      process.exitCode = 3;
      return err instanceof AppError ? `${err.code}: ${err.message}` : String(err);
    } finally {
      await pool.end();
    }
    return 'Contraseña restablecida: deberá cambiarla al entrar.';
  },
  /**
   * RF-INS-02: el mantenimiento (reparar, actualizar, trasladar, desinstalar) se valida contra el código que tiene el
   * servidor, que una Apoderada puede haber cambiado, no contra el del instalador. Lee el código por la entrada.
   */
  async 'check-code'() {
    const code = installationCodeSchema.safeParse((await input()).trim());
    const client = new pg.Client({ connectionString: cfg().databaseUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ hash: string | null }>(
        'SELECT installation_code_hash AS hash FROM system_settings',
      );
      const hash = rows[0]?.hash;
      if (!code.success || !hash || !(await verifySecret(hash, code.data))) {
        process.exitCode = 3;
        return 'INSTALL_CODE_INVALID';
      }
      return 'ok';
    } finally {
      await client.end();
    }
  },
};

const command = commands[process.argv[2] ?? ''];
if (!command) {
  console.error(`Uso: node dist/setup/tasks.js <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
console.log(await command());
