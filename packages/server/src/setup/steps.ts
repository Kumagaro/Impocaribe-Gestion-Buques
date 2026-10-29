// T126 · plan §10.3: los pasos de «Crear servidor» sobre la PC (Sys: comandos de Windows y archivos). Cada uno es
// idempotente, anota si lo que dejó es suyo y solo deshace eso: lo que ya existía (otra instalación, Reparar) se
// conserva. Si falla a medias, limpia lo suyo antes de fallar (engine.ts). Las contraseñas de la base se generan al
// crearla y se guardan en ProgramData\Impocaribe\servicio, con permisos solo para el sistema y los administradores.
import { join } from 'node:path';
import type { Step, UndoInfo } from './engine.ts';
import {
  appDatabaseUrl,
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
  /**
   * Crea la carpeta si falta y la deja solo para el sistema y los administradores, también lo que ya tuviera dentro:
   * en ProgramData cualquier usuario puede crear carpetas, así que no se confía en una que ya existiera.
   */
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
  /**
   * T130 · RF-INS-07: crear desde un respaldo de traslado. La base, los archivos y la identidad salen del archivo (la
   * misma identidad: los dispositivos se reconectan solos) y se conserva su montaje de red.
   */
  move?: { file: string; password: string };
}

interface Secrets {
  postgres: string;
  app: string;
}

const mine = (created: boolean): UndoInfo => ({ mine: created });

/** Lo que comparten los pasos de crear y de actualizar: rutas, secretos, tareas del servidor y esperas. */
export function machine(sys: Sys, l: Layout) {
  const p = paths(l);
  const secretsFile = join(p.serviceDir, 'secretos.json');
  const exe = (name: string) => join(p.pgBin, `${name}.exe`);
  const secrets = async () => JSON.parse(await sys.readFile(secretsFile)) as Secrets;
  const appUrl = (s: Secrets) => appDatabaseUrl(s.app);
  const serverEnv = async (): Promise<Record<string, string>> => ({
    NODE_ENV: 'production',
    DATABASE_URL: appUrl(await secrets()),
    IMPOCARIBE_DATA_DIR: p.dataDir,
    IMPOCARIBE_IDENTITY_DIR: p.identityDir,
    IMPOCARIBE_PG_BIN: p.pgBin,
  });
  /** Una tarea del servidor instalado (tasks.js), con su propio Node y el entorno del servicio. */
  const tasks = async (command: string, stdin?: string, args: string[] = []) =>
    sys.run(p.node, [join(l.program, 'server', 'dist', 'setup', 'tasks.js'), command, ...args], {
      env: await serverEnv(),
      ...(stdin === undefined ? {} : { input: stdin }),
    });
  const until = async (what: string, check: () => Promise<boolean>, seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      if (await check()) return;
      await sys.sleep(1000);
    }
    throw new Error(`${what} no respondió en ${seconds} s.`);
  };
  const databaseReady = () => sys.succeeds(exe('pg_isready'), ['-h', 'localhost', '-p', String(PG_PORT)]);
  /** Detiene los servicios y espera a que terminen (Stop-Service espera; sc.exe stop no). */
  const stopServices = (...names: string[]) =>
    sys.run('powershell.exe', ['-NoProfile', '-Command', `Stop-Service -Name ${names.join(',')} -Force`]);
  return { p, secretsFile, exe, secrets, appUrl, tasks, until, databaseReady, stopServices };
}

export function createSteps(sys: Sys, l: Layout, input: CreateInput): Step[] {
  const { p, secretsFile, exe, secrets, appUrl, tasks, until } = machine(sys, l);
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
          // Primero la carpeta solo para el sistema y los administradores (aunque alguien la hubiera creado antes), y
          // después los secretos.
          await sys.lockDown(l.data);
          await sys.writeFile(secretsFile, JSON.stringify(s));
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
        if (input.move) {
          try {
            log(await tasks('restore-move', input.move.password, [input.move.file]));
          } catch (err) {
            // Lo que el traslado dejó a medias (la identidad, los archivos) no se queda.
            await sys.remove(p.identityDir);
            await sys.remove(join(p.dataDir, 'files'));
            throw err;
          }
        }
        log(await tasks('migrate'));
        return { moved: input.move !== undefined };
      },
      // La base se borra con su carpeta (paso «base»); si ya existía, se conserva con sus datos. Lo traído de un
      // traslado (la identidad y los archivos) se quita.
      async undo(info) {
        if (!info.moved) return;
        await sys.remove(p.identityDir);
        await sys.remove(join(p.dataDir, 'files'));
      },
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
          await sys.lockDown(p.serviceDir);
          await sys.writeFile(serviceConfig, serviceXml(l, appUrl(await secrets())));
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
        if (input.move) {
          log('Se conservan el montaje de red y el código de instalación del servidor trasladado.');
          return {};
        }
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

/** T129: la carpeta con la copia de la versión anterior (programa y base) mientras se actualiza. */
export const updateKeep = (l: Layout) => join(l.data, 'actualizacion');

/**
 * T129 · RF-INS-06 y plan §10.5: actualizar el servidor con el programa de un instalador completo nuevo. Detiene los
 * servicios, guarda en frío una copia del programa y de la base (el respaldo para volver atrás: queda en la carpeta de
 * datos, solo para el sistema y los administradores, como la base misma), pone el programa nuevo, migra, arranca y
 * comprueba, y publica el instalador ligero y el APK que trae. Si algo falla, Deshacer vuelve, en orden inverso, a la
 * versión anterior con sus datos.
 */
export function updateSteps(sys: Sys, l: Layout, input: { bundle: string }): Step[] {
  const { p, tasks, until, databaseReady, stopServices } = machine(sys, l);
  const keep = updateKeep(l);
  const oldProgram = join(keep, 'programa');
  const oldPgdata = join(keep, 'pgdata');
  const start = createSteps(sys, l, { bundle: input.bundle, network: 'router', codeHash: '' }).find(
    (s) => s.id === 'arranque',
  )!;
  const startAll = async () => {
    await sys.succeeds('sc.exe', ['start', SERVICES.database]);
    await until('La base de datos', databaseReady, 60);
    await sys.succeeds('sc.exe', ['start', SERVICES.server]);
  };
  const restore = async (copy: string, to: string) => {
    await sys.remove(to);
    await sys.copy(copy, to);
  };
  const restoreDatabase = async () => {
    await stopServices(SERVICES.server, SERVICES.database);
    await restore(oldPgdata, p.pgdata);
  };

  return [
    {
      id: 'detener',
      title: 'Detener el servidor y la base de datos',
      async run() {
        await stopServices(SERVICES.server, SERVICES.database);
      },
      async undo() {
        await startAll();
      },
    },
    {
      id: 'copia',
      title: 'Guardar una copia de la versión anterior y de sus datos',
      async run(log) {
        await sys.remove(keep);
        await sys.copy(l.program, oldProgram);
        await sys.copy(p.pgdata, oldPgdata);
        log(`Copia guardada en ${keep}.`);
      },
      // La copia se conserva: es lo que usan los pasos siguientes para volver atrás, y la próxima actualización la
      // reemplaza.
      async undo() {},
    },
    {
      id: 'programa',
      title: 'Copiar la nueva versión',
      async run() {
        try {
          await sys.remove(l.program);
          await sys.copy(input.bundle, l.program);
        } catch (err) {
          await restore(oldProgram, l.program);
          throw err;
        }
      },
      async undo() {
        await restore(oldProgram, l.program);
      },
    },
    {
      id: 'estructura',
      title: 'Actualizar la estructura de los datos',
      async run(log) {
        try {
          await sys.succeeds('sc.exe', ['start', SERVICES.database]);
          await until('La base de datos', databaseReady, 60);
          log(await tasks('migrate'));
        } catch (err) {
          // Una migración a medias no se deja: la base vuelve a la copia en frío.
          await restoreDatabase();
          throw err;
        }
      },
      async undo() {
        await restoreDatabase();
      },
    },
    start,
    {
      id: 'publicar',
      title: 'Publicar la app ligera y el APK de la nueva versión',
      async run(log) {
        // RF-UPD-01: si no se pudo publicar, el servidor nuevo ya funciona: se publica a mano en P-26.
        try {
          log(await tasks('publish-bundled', undefined, [join(l.program, 'publicar')]));
        } catch (err) {
          log(
            `No se publicaron (publíquelos en Versiones de la app): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
      async undo() {},
    },
  ];
}

/**
 * T131 · RF-INS-08 y plan §10.5: desinstalar el servidor. Un respaldo final (el servidor tiene que estar en marcha),
 * detener y quitar los servicios, las reglas del firewall y el ajuste de energía (con lo que guardó el diario de la
 * creación), los datos a `desinstalado-<fecha>` (o borrados, salvo el respaldo final, que va cifrado) y el programa.
 * No se deshace: es lo que se pidió, con la palabra DESINSTALAR y el código.
 */
export function uninstallSteps(
  sys: Sys,
  l: Layout,
  input: { wipe: boolean; day: string; previousPower?: Record<string, [number, number]> },
): Step[] {
  const { p, tasks, stopServices } = machine(sys, l);
  const keep = join(l.data, `desinstalado-${input.day}`);
  const serviceExe = join(p.serviceDir, `${SERVICES.server}.exe`);
  const exists = (service: string) => sys.succeeds('sc.exe', ['query', service]);
  let finalBackup: string | null = null;
  return [
    {
      id: 'respaldo',
      title: 'Hacer un respaldo final',
      async run(log) {
        finalBackup = (await tasks('backup-final')).trim();
        log(`Respaldo final: ${finalBackup}`);
      },
      async undo() {},
    },
    {
      id: 'detener',
      title: 'Detener el servidor y la base de datos',
      async run() {
        const running = [];
        for (const service of [SERVICES.server, SERVICES.database]) if (await exists(service)) running.push(service);
        if (running.length) await stopServices(...running);
      },
      async undo() {},
    },
    {
      id: 'servicios',
      title: 'Quitar los servicios de Windows',
      async run() {
        if (await exists(SERVICES.server)) await sys.run(serviceExe, ['uninstall']);
        if (await exists(SERVICES.database))
          await sys.run(join(p.pgBin, 'pg_ctl.exe'), ['unregister', '-N', SERVICES.database]);
      },
      async undo() {},
    },
    {
      id: 'firewall',
      title: 'Quitar las reglas del firewall',
      async run() {
        for (const rule of FIREWALL_RULES)
          if (await sys.succeeds('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${rule.name}`]))
            await sys.run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${rule.name}`]);
      },
      async undo() {},
    },
    {
      id: 'energia',
      title: 'Devolver la energía de Windows a como estaba',
      async run(log) {
        const previous = input.previousPower ?? {};
        if (!Object.keys(previous).length) return log('No hay ajustes de energía que devolver.');
        for (const [setting, [ac, dc]] of Object.entries(previous)) {
          await sys.run('powercfg', ['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_SLEEP', setting, String(ac)]);
          await sys.run('powercfg', ['/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_SLEEP', setting, String(dc)]);
        }
        await sys.run('powercfg', ['/setactive', 'SCHEME_CURRENT']);
      },
      async undo() {},
    },
    {
      id: 'datos',
      title: input.wipe
        ? 'Borrar los datos (se conserva el respaldo final)'
        : 'Guardar los datos en una carpeta aparte',
      async run(log) {
        const dirs = [p.pgdata, p.identityDir, p.dataDir, p.serviceDir];
        if (input.wipe) {
          if (finalBackup) await sys.copy(finalBackup, join(keep, 'respaldo-final.icbak'));
        } else
          for (const dir of dirs)
            if (await sys.exists(dir)) await sys.copy(dir, join(keep, dir.slice(l.data.length + 1)));
        for (const dir of [...dirs, updateKeep(l)]) await sys.remove(dir);
        for (const file of ['setup-journal.json', 'actualizacion-diario.json']) await sys.remove(join(l.data, file));
        log(`${input.wipe ? 'Respaldo final' : 'Datos'} en ${keep}.`);
      },
      async undo() {},
    },
    {
      id: 'programa',
      title: 'Quitar el programa del servidor',
      async run() {
        await sys.remove(l.program);
      },
      async undo() {},
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
