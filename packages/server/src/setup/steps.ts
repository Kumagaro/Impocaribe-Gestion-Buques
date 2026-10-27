// T126 · plan §10.3: los pasos de «Crear servidor» sobre la PC (Sys: comandos de Windows y archivos). Cada uno es
// idempotente, anota si lo que dejó es suyo y solo deshace eso: lo que ya existía (otra instalación, Reparar) se
// conserva. Si falla a medias, limpia lo suyo antes de fallar (engine.ts). Las contraseñas de la base se generan al
// crearla y se guardan en ProgramData\Impocaribe\servicio, con permisos solo para el sistema y los administradores.
import { join } from 'node:path';
import type { Step, UndoInfo } from './engine.ts';
import {
  DATABASE,
  DB_USER,
  FIREWALL_RULES,
  firewallAdd,
  paths,
  PG_PORT,
  postgresqlConf,
  SERVER_PORT,
  serviceXml,
  SERVICES,
  type Layout,
} from './layout.ts';

export interface Sys {
  /** Ejecuta un programa; si termina mal, lanza un Error con lo que dijo. */
  run(file: string, args: string[], options?: { env?: Record<string, string>; input?: string }): Promise<string>;
  /** Como run, pero sin lanzar: si terminó bien. */
  succeeds(file: string, args: string[]): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  /** Copia un archivo o una carpeta entera (sobrescribe). */
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  /** Crea las carpetas que falten. */
  writeFile(path: string, text: string): Promise<void>;
  /** Deja la carpeta solo para el sistema y los administradores (icacls). */
  lockDown(path: string): Promise<void>;
  /** GET local verificado con la CA del servidor (`ca`, PEM): si respondió 200. */
  ok(url: string, ca: string): Promise<boolean>;
  secret(): string;
  sleep(ms: number): Promise<void>;
}

export interface CreateInput {
  /** La carpeta server-bundle de donde se copia el programa. */
  bundle: string;
  network: 'router' | 'hotspot';
  /** La comprobación (argon2id) del código de instalación de la empresa, que trae el instalador. */
  codeHash: string;
}

interface Secrets {
  postgres: string;
  app: string;
}

const mine = (created: boolean): UndoInfo => ({ mine: created });

export function createSteps(sys: Sys, l: Layout, input: CreateInput): Step[] {
  const p = paths(l);
  const secretsFile = join(p.serviceDir, 'secretos.json');
  const exe = (name: string) => join(p.pgBin, `${name}.exe`);
  const secrets = async () => JSON.parse(await sys.readFile(secretsFile)) as Secrets;
  const appUrl = (s: Secrets) => `postgres://${DB_USER}:${encodeURIComponent(s.app)}@localhost:${PG_PORT}/${DATABASE}`;
  const serverEnv = async (): Promise<Record<string, string>> => ({
    NODE_ENV: 'production',
    DATABASE_URL: appUrl(await secrets()),
    IMPOCARIBE_DATA_DIR: p.dataDir,
    IMPOCARIBE_IDENTITY_DIR: p.identityDir,
  });
  const tasks = async (command: string, stdin?: string) =>
    sys.run(p.node, [join(l.program, 'server', 'dist', 'setup', 'tasks.js'), command], {
      env: await serverEnv(),
      ...(stdin === undefined ? {} : { input: stdin }),
    });
  const serviceExe = join(p.serviceDir, `${SERVICES.server}.exe`);
  const serviceConfig = join(p.serviceDir, `${SERVICES.server}.xml`);
  const removeRules = async (names: string[]) => {
    for (const name of names) await sys.run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`]);
  };
  const restorePower = async (previous: Record<string, [number, number]>) => {
    for (const [setting, [ac, dc]] of Object.entries(previous)) {
      await sys.run('powercfg', ['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_SLEEP', setting, String(ac)]);
      await sys.run('powercfg', ['/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_SLEEP', setting, String(dc)]);
    }
    await sys.run('powercfg', ['/setactive', 'SCHEME_CURRENT']);
  };
  const until = async (what: string, check: () => Promise<boolean>, seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      if (await check()) return;
      await sys.sleep(1000);
    }
    throw new Error(`${what} no respondió en ${seconds} s.`);
  };

  return [
    {
      id: 'copiar',
      title: 'Copiar los componentes del servidor',
      async run() {
        const existed = await sys.exists(l.program);
        await sys.copy(input.bundle, l.program);
        return mine(!existed);
      },
      async undo(info) {
        if (info.mine) await sys.remove(l.program);
      },
    },
    {
      id: 'base',
      title: 'Crear la base de datos',
      async run(log) {
        if (await sys.exists(join(p.pgdata, 'PG_VERSION'))) {
          log('Ya hay una base de datos: se conserva.');
          return mine(false);
        }
        const dataExisted = await sys.exists(l.data);
        const s: Secrets = { postgres: sys.secret(), app: sys.secret() };
        const pwfile = join(p.serviceDir, 'pw.tmp');
        try {
          await sys.writeFile(secretsFile, JSON.stringify(s));
          await sys.lockDown(l.data);
          await sys.writeFile(pwfile, s.postgres);
          await sys.run(exe('initdb'), [
            '-D',
            p.pgdata,
            '-U',
            'postgres',
            '-A',
            'scram-sha-256',
            `--pwfile=${pwfile}`,
            '-E',
            'UTF8',
            '--locale-provider=icu',
            '--icu-locale=es',
            '--locale=C',
          ]);
          await sys.writeFile(join(p.pgdata, 'impocaribe.conf'), postgresqlConf());
          const conf = join(p.pgdata, 'postgresql.conf');
          await sys.writeFile(conf, `${await sys.readFile(conf)}\ninclude 'impocaribe.conf'\n`);
        } catch (err) {
          await sys.remove(dataExisted ? p.pgdata : l.data);
          await sys.remove(secretsFile);
          throw err;
        } finally {
          await sys.remove(pwfile);
        }
        return { mine: true, dataExisted };
      },
      async undo(info) {
        if (!info.mine) return;
        await sys.remove(p.pgdata);
        await sys.remove(secretsFile);
        // Si la carpeta de datos la creó la instalación, se quita entera.
        if (!info.dataExisted) await sys.remove(l.data);
      },
    },
    {
      id: 'servicio-base',
      title: 'Registrar la base de datos como servicio',
      async run() {
        const existed = await sys.succeeds('sc.exe', ['query', SERVICES.database]);
        if (!existed)
          await sys.run(exe('pg_ctl'), ['register', '-N', SERVICES.database, '-D', p.pgdata, '-S', 'auto', '-w']);
        await sys.succeeds('sc.exe', ['start', SERVICES.database]);
        await until(
          'La base de datos',
          () => sys.succeeds(exe('pg_isready'), ['-h', 'localhost', '-p', String(PG_PORT)]),
          60,
        );
        return mine(!existed);
      },
      async undo(info) {
        if (!info.mine) return;
        await sys.succeeds('sc.exe', ['stop', SERVICES.database]);
        await sys.run(exe('pg_ctl'), ['unregister', '-N', SERVICES.database]);
      },
    },
    {
      id: 'estructura',
      title: 'Preparar la estructura de los datos',
      async run(log) {
        const s = await secrets();
        const psql = (sql: string) =>
          sys.run(
            exe('psql'),
            [
              '-h',
              'localhost',
              '-p',
              String(PG_PORT),
              '-U',
              'postgres',
              '-d',
              'postgres',
              '-v',
              'ON_ERROR_STOP=1',
              '-tAc',
              sql,
            ],
            {
              env: { PGPASSWORD: s.postgres },
            },
          );
        await psql(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN ` +
            `CREATE ROLE ${DB_USER} LOGIN PASSWORD '${s.app.replace(/'/g, "''")}'; END IF; END $$`,
        );
        if ((await psql(`SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`)).trim() !== '1')
          await psql(`CREATE DATABASE ${DATABASE} OWNER ${DB_USER}`);
        log(await tasks('migrate'));
        return {};
      },
      // La base se borra con su carpeta (paso «base»); si ya existía, se conserva con sus datos.
      async undo() {},
    },
    {
      id: 'identidad',
      title: 'Crear la identidad y el certificado del servidor',
      async run(log) {
        const result = JSON.parse(await tasks('identity')) as { created: boolean; name: string };
        log(`Servidor ${result.name}${result.created ? '' : ' (ya existía: se conserva)'}`);
        return mine(result.created);
      },
      async undo(info) {
        if (info.mine) await sys.remove(p.identityDir);
      },
    },
    {
      id: 'servicio',
      title: 'Registrar el servidor como servicio de Windows',
      async run() {
        const existed = await sys.succeeds('sc.exe', ['query', SERVICES.server]);
        try {
          await sys.copy(p.winsw, serviceExe);
          await sys.writeFile(serviceConfig, serviceXml(l, appUrl(await secrets())));
          await sys.lockDown(p.serviceDir);
          await sys.run(serviceExe, [existed ? 'refresh' : 'install']);
        } catch (err) {
          if (!existed) for (const file of [serviceExe, serviceConfig]) await sys.remove(file);
          throw err;
        }
        return mine(!existed);
      },
      async undo(info) {
        if (!info.mine) return;
        await sys.succeeds(serviceExe, ['stop']);
        await sys.run(serviceExe, ['uninstall']);
        for (const file of [serviceExe, serviceConfig]) await sys.remove(file);
      },
    },
    {
      id: 'firewall',
      title: 'Permitir la red local en el firewall',
      async run() {
        const created: string[] = [];
        try {
          for (const rule of FIREWALL_RULES) {
            if (await sys.succeeds('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${rule.name}`])) continue;
            await sys.run('netsh', firewallAdd(rule));
            created.push(rule.name);
          }
        } catch (err) {
          await removeRules(created);
          throw err;
        }
        return { created };
      },
      async undo(info) {
        await removeRules((info.created as string[] | undefined) ?? []);
      },
    },
    {
      id: 'energia',
      title: 'Ajustar la energía para que la PC no se suspenda',
      async run() {
        const previous: Record<string, [number, number]> = {};
        try {
          for (const setting of SLEEP_SETTINGS) {
            previous[setting] = acDc(await sys.run('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', setting]));
            for (const side of ['/setacvalueindex', '/setdcvalueindex'])
              await sys.run('powercfg', [side, 'SCHEME_CURRENT', 'SUB_SLEEP', setting, '0']);
          }
          await sys.run('powercfg', ['/setactive', 'SCHEME_CURRENT']);
        } catch (err) {
          await restorePower(previous);
          throw err;
        }
        return { previous };
      },
      async undo(info) {
        await restorePower((info.previous as Record<string, [number, number]> | undefined) ?? {});
      },
    },
    {
      id: 'montaje',
      title: 'Guardar el montaje de red',
      async run(log) {
        log(await tasks('settings', JSON.stringify({ network: input.network, codeHash: input.codeHash })));
        return {};
      },
      async undo() {},
    },
    {
      id: 'arranque',
      title: 'Arrancar y comprobar (servidor, base de datos y PDF)',
      async run() {
        await sys.succeeds('sc.exe', ['start', SERVICES.server]);
        const base = `https://localhost:${SERVER_PORT}/api/v1`;
        const ca = await sys.readFile(join(p.identityDir, 'ca.crt'));
        await until('El servidor', () => sys.ok(`${base}/health`, ca), 90);
        await until('El anuncio del servidor', () => sys.ok(`${base}/discovery`, ca), 30);
        return mine(true);
      },
      async undo() {
        await sys.succeeds('sc.exe', ['stop', SERVICES.server]);
      },
    },
  ];
}

/** Suspensión e hibernación por inactividad: el servidor tiene que poder aplicar su modo protegido y su parada. */
export const SLEEP_SETTINGS = ['STANDBYIDLE', 'HIBERNATEIDLE'];

/**
 * Los valores con corriente y con batería de la salida de `powercfg /query`, que son los dos últimos números
 * hexadecimales: los textos cambian con el idioma de Windows, los números no.
 */
export function acDc(output: string): [number, number] {
  const values = output.match(/0x[0-9a-f]{8}/gi) ?? [];
  if (values.length < 2) throw new Error('No se pudo leer la configuración de energía actual.');
  return [Number(values.at(-2)), Number(values.at(-1))];
}
