// T126 · plan §10.3 (pasos 4, 5 y 9): lo que el ayudante le pide al servidor ya copiado, con su propio Node y el entorno
// del servicio (DATABASE_URL y las carpetas): aplicar las migraciones, crear la identidad (si ya hay una, se conserva:
// reemplazarla dejaría huérfanos a los dispositivos) y guardar el montaje de red y la comprobación del código.
//   node dist/setup/tasks.js migrate | identity | settings   (settings lee {network, codeHash} por la entrada)
import { readFile } from 'node:fs/promises';
import { stdin } from 'node:process';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import pg from 'pg';
import { verifySecret } from '../auth/password.ts';
import { config } from '../config.ts';
import { runMigrations } from '../db/migrate.ts';
import { createIdentity, IdentityExistsError } from '../identity/identity.ts';
import { windowsMachineProtector } from '../identity/protector.ts';

const cfg = config();

async function input(): Promise<string> {
  let text = '';
  for await (const chunk of stdin) text += String(chunk);
  return text;
}

const commands: Record<string, () => Promise<string>> = {
  async migrate() {
    await runMigrations(cfg.databaseUrl);
    return 'Estructura de los datos al día.';
  },
  async identity() {
    try {
      const identity = await createIdentity(cfg.identityDir, {
        protector: windowsMachineProtector(),
        clock: { now: () => new Date() },
      });
      return JSON.stringify({ created: true, name: identity.name });
    } catch (err) {
      if (!(err instanceof IdentityExistsError)) throw err;
      const meta = JSON.parse(await readFile(`${cfg.identityDir}/identity.json`, 'utf8')) as { name: string };
      return JSON.stringify({ created: false, name: meta.name });
    }
  },
  async settings() {
    const { network, codeHash } = JSON.parse(await input()) as { network: 'router' | 'hotspot'; codeHash: string };
    if (network !== 'router' && network !== 'hotspot')
      throw new Error(`Montaje de red desconocido: ${String(network)}`);
    if (!codeHash.startsWith('$argon2id$')) throw new Error('La comprobación del código de instalación no es válida.');
    const client = new pg.Client({ connectionString: cfg.databaseUrl });
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
  /**
   * RF-INS-02: el mantenimiento (reparar, actualizar, trasladar, desinstalar) se valida contra el código que tiene el
   * servidor, que una Apoderada puede haber cambiado, no contra el del instalador. Lee el código por la entrada.
   */
  async 'check-code'() {
    const code = installationCodeSchema.safeParse((await input()).trim());
    const client = new pg.Client({ connectionString: cfg.databaseUrl });
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
