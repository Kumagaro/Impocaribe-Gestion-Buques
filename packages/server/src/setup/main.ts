// T126 · DT-17 y plan §10.3: impocaribe-setup.exe, el ayudante de instalación. La app de escritorio lo lanza con permiso
// de administrador de Windows:
//   impocaribe-setup.exe crear|reparar|reiniciar|actualizar|trasladar|deshacer|restablecer [--tuberia \\.\pipe\<nombre>]
// y por la tubería le manda {network, code} (crear), {code} (reparar) o {code, username, password} (restablecer). Va
// dentro de server-bundle, que es de donde copia el programa. Al crear, el código se compara con la comprobación que
// trae el instalador; al reparar, con la que guarda el servidor (RF-INS-02).
// T127: P-28 lo usa también sin elevar, antes de pedir el permiso (pasos 1 y 2):
//   impocaribe-setup.exe comprobar   escribe los datos de la PC (PcFacts) en JSON
//   impocaribe-setup.exe codigo      lee el código por la entrada y escribe «ok» o INSTALL_CODE_INVALID
//   impocaribe-setup.exe traslado    lee {file, password} y escribe de qué servidor es el archivo de traslado (T130)
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canCreateServer, checkServerPc, compareVersions } from '@impocaribe/shared';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import { verifySecret } from '../auth/password.ts';
import { runSteps, undoSteps, type Outcome, type Step } from './engine.ts';
import { gatherFacts } from './facts.ts';
import { fileJournal, journalPath } from './journal.ts';
import { appDatabaseUrl, layout, paths, SERVICES } from './layout.ts';
import { progressTo, type Progress } from './progress.ts';
import { MIGRATED_MESSAGE } from '../server-state.ts';
import { createSteps, machine, updateSteps } from './steps.ts';
import { windowsSys } from './windows-sys.ts';

/** Reparar rehace estos pasos sin tocar la base ni la identidad (plan §10.3). */
export const REPAIR = ['copiar', 'servicio-base', 'servicio', 'firewall', 'energia', 'arranque'];

const operation = process.argv[2];
/** Las operaciones que piden el permiso de Windows (las demás, comprobar, codigo y traslado, no tocan la PC). */
const ELEVATED = ['crear', 'reparar', 'reiniciar', 'actualizar', 'trasladar', 'deshacer', 'restablecer'] as const;
const pipeAt = process.argv.indexOf('--tuberia');
const pipe = pipeAt > 0 ? process.argv[pipeAt + 1] : undefined;
const bundle = dirname(process.execPath);
const l = layout();

const fail = (step: string, error: string): Outcome => ({ ok: false, step, error });

/** La lista de pasos de P-28, con sus títulos, antes de empezar. */
const plan = (progress: Progress, steps: Step[]) =>
  progress.send({ type: 'plan', steps: steps.map(({ id, title }) => ({ id, title })) });

/** La comprobación del código que trae el instalador completo (solo la comprobación: el código va impreso aparte). */
const installerCodeHash = async () => (await readFile(join(bundle, 'codigo-instalacion.hash'), 'utf8')).trim();

async function main(progress: Progress): Promise<Outcome> {
  const request = (await progress.request) as {
    network?: unknown;
    code?: unknown;
    move?: { file?: unknown; password?: unknown };
    dest?: unknown;
    password?: unknown;
  };
  const code = installationCodeSchema.safeParse(String(request.code ?? ''));
  const journal = fileJournal(journalPath());
  const report = progress.send;

  if (operation === 'deshacer') {
    const steps = createSteps(windowsSys, l, { bundle, network: 'router', codeHash: '' });
    plan(progress, steps);
    return undoSteps('create', steps, journal, report);
  }

  if (operation === 'crear') {
    const codeHash = await installerCodeHash();
    if (!code.success || !(await verifySecret(codeHash, code.data)))
      return fail('permisos', 'INSTALL_CODE_INVALID: el código de instalación no es el de esta empresa.');
    const network = request.network === 'hotspot' ? 'hotspot' : 'router';
    const checks = checkServerPc(await gatherFacts());
    progress.send({ type: 'checks', checks });
    if (!canCreateServer(checks)) return fail('comprobacion', checks.find((c) => c.level === 'bad')!.title);
    // T130: desde un respaldo de traslado, la base, los archivos y la identidad salen del archivo.
    const move =
      typeof request.move?.file === 'string' && typeof request.move.password === 'string'
        ? { file: request.move.file, password: request.move.password }
        : undefined;
    const steps = createSteps(windowsSys, l, { bundle, network, codeHash, ...(move ? { move } : {}) });
    plan(progress, steps);
    return runSteps('create', steps, journal, report);
  }

  // RF-INS-02: el mantenimiento, con el código que guarda el servidor (una Apoderada puede haberlo cambiado).
  const maintenance = ['reparar', 'reiniciar', 'actualizar', 'trasladar'].includes(operation ?? '');
  if (maintenance && !(await serverCodeOk(code.success ? code.data : '')))
    return fail('permisos', 'INSTALL_CODE_INVALID: el código de instalación no es correcto.');
  // D14: un servidor trasladado no se repara, ni se arranca, ni se actualiza aquí.
  if (maintenance && (await installed('server-state')).trim() === 'migrated')
    return fail('comprobacion', MIGRATED_MESSAGE);

  if (operation === 'trasladar') {
    // T130 · RF-INS-07: el archivo de traslado donde se eligió, y este servidor detenido y deshabilitado.
    const dest = typeof request.dest === 'string' ? request.dest : '';
    const password = typeof request.password === 'string' ? request.password : '';
    const steps: Step[] = [
      {
        id: 'archivo',
        title: 'Crear el archivo de traslado (datos e identidad, cifrados)',
        async run(log) {
          log(await installed('prepare-move', password, [dest]));
        },
        async undo() {},
      },
      {
        id: 'detener',
        title: 'Detener el servidor',
        async run() {
          await windowsSys.run('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Stop-Service -Name ${SERVICES.server} -Force`,
          ]);
        },
        async undo() {},
      },
      {
        id: 'deshabilitar',
        title: 'Deshabilitar el servidor en esta PC',
        async run() {
          await windowsSys.run('sc.exe', ['config', SERVICES.server, 'start=', 'disabled']);
        },
        async undo() {},
      },
    ];
    plan(progress, steps);
    return runSteps('trasladar', steps, { load: async () => null, save: async () => undefined }, report);
  }

  if (operation === 'actualizar') {
    // T129 · RF-INS-06: solo con un instalador más nuevo que el servidor instalado.
    const version = async (dir: string) =>
      (JSON.parse(await readFile(join(dir, 'server', 'package.json'), 'utf8')) as { version: string }).version;
    const installed = await version(l.program);
    const incoming = await version(bundle);
    if (compareVersions(incoming, installed) <= 0)
      return fail('comprobacion', `Este instalador trae la ${incoming} y el servidor ya tiene la ${installed}.`);
    const updateJournal = fileJournal(join(dirname(journalPath()), 'actualizacion-diario.json'));
    const steps = updateSteps(windowsSys, l, { bundle });
    plan(progress, steps);
    // Una actualización anterior a medias (un corte de luz) se deshace antes de empezar; una completa se olvida.
    const previous = await updateJournal.load();
    if (previous && steps.every((s) => previous.steps.some((d) => d.id === s.id && d.status === 'done')))
      await updateJournal.save({ operation: 'update', steps: [] });
    else if (previous?.steps.length) await undoSteps('update', steps, updateJournal, report);
    const outcome = await runSteps('update', steps, updateJournal, report);
    if (outcome.ok) return outcome;
    // Vuelta atrás automática: la versión anterior con sus datos.
    const back = await undoSteps('update', steps, updateJournal, report);
    return { ...outcome, rolledBack: back.ok };
  }

  if (operation === 'reiniciar') {
    // T128 · P-29: detener y volver a arrancar con la comprobación de «arranque». Sin diario: no hay nada que deshacer,
    // y el de la creación se conserva (con él se deshace).
    const start = createSteps(windowsSys, l, { bundle, network: 'router', codeHash: '' }).find(
      (s) => s.id === 'arranque',
    )!;
    const steps: Step[] = [
      {
        id: 'detener',
        title: 'Detener el servidor',
        async run() {
          await windowsSys.run('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Stop-Service -Name ${SERVICES.server} -Force`,
          ]);
        },
        async undo() {},
      },
      start,
    ];
    plan(progress, steps);
    return runSteps('reiniciar', steps, { load: async () => null, save: async () => undefined }, report);
  }

  if (operation === 'reparar') {
    // Solo estos pasos: la base, la identidad y el montaje no se tocan aunque falte el diario.
    const steps = createSteps(windowsSys, l, { bundle, network: 'router', codeHash: '' }).filter((s) =>
      REPAIR.includes(s.id),
    );
    plan(progress, steps);
    return runSteps('create', steps, journal, report, REPAIR);
  }

  if (operation === 'restablecer') {
    // RF-INS-11: la petición {code, username, password} pasa tal cual al servidor, que lo comprueba y lo registra.
    const r = request as { code?: unknown; username?: unknown; password?: unknown };
    const result = await windowsSys
      .run(paths(l).node, [join(l.program, 'server', 'dist', 'setup', 'tasks.js'), 'emergency-reset'], {
        input: JSON.stringify({ code: r.code, username: r.username, password: r.password }),
        env: { NODE_ENV: 'production', DATABASE_URL: await databaseUrl() },
      })
      .then(
        () => null,
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      );
    return result === null ? { ok: true } : fail('restablecer', result);
  }

  return fail(
    'inicio',
    `Operación desconocida: ${String(operation)}. Use crear, reparar, reiniciar, actualizar, trasladar, deshacer o restablecer.`,
  );
}

/** Si el código es el que guarda el servidor (tasks.js check-code, con la conexión de la instalación). */
async function serverCodeOk(code: string): Promise<boolean> {
  const check = await windowsSys
    .run(paths(l).node, [join(l.program, 'server', 'dist', 'setup', 'tasks.js'), 'check-code'], {
      input: code,
      env: { NODE_ENV: 'production', DATABASE_URL: await databaseUrl() },
    })
    .catch(() => 'INSTALL_CODE_INVALID');
  return check.trim() === 'ok';
}

/** Una tarea del servidor instalado (tasks.js), con su Node, su base y sus carpetas. */
const installed = (command: string, stdin?: string, args: string[] = []) =>
  machine(windowsSys, l).tasks(command, stdin, args);

/** La conexión de la app a la base, de los secretos que guardó la instalación. */
async function databaseUrl(): Promise<string> {
  const { app } = JSON.parse(await readFile(join(paths(l).serviceDir, 'secretos.json'), 'utf8')) as { app: string };
  return appDatabaseUrl(app);
}

/** T127 · P-28 pasos 1 y 2, sin elevar: no toca nada de la PC. Devuelve el código de salida. */
async function unelevated(): Promise<number> {
  if (operation === 'comprobar') {
    process.stdout.write(`${JSON.stringify(await gatherFacts())}\n`);
    return 0;
  }
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  if (operation === 'traslado') {
    // T130 · P-28: el archivo de traslado, con el servidor que trae el instalador (todavía no hay uno instalado).
    const { file, password } = JSON.parse(text) as { file: string; password: string };
    const out = await windowsSys
      .run(join(bundle, 'node', 'node.exe'), [join(bundle, 'server', 'dist', 'setup', 'tasks.js'), 'read-move', file], {
        input: password,
        env: { NODE_ENV: 'production' },
      })
      .then(
        (o) => ({ o, code: 0 }),
        // «node.exe terminó con 3: BACKUP_PASSWORD_INVALID: …» → solo lo que dijo la tarea.
        (err: unknown) => ({
          o: (err instanceof Error ? err.message : String(err)).replace(/^.*? terminó con \d+: /, ''),
          code: 3,
        }),
      );
    process.stdout.write(`${out.o.trim()}\n`);
    return out.code;
  }
  const code = installationCodeSchema.safeParse(text.trim());
  const ok = code.success && (await verifySecret(await installerCodeHash(), code.data));
  process.stdout.write(ok ? 'ok\n' : 'INSTALL_CODE_INVALID\n');
  return ok ? 0 : 3;
}

// Sin «await» de nivel superior: el ejecutable (Node SEA) lleva el script en CommonJS.
void (async () => {
  if (operation === 'comprobar' || operation === 'codigo' || operation === 'traslado') {
    process.exitCode = await unelevated();
    return;
  }
  // Una operación desconocida no toca nada de la PC (ni crea la carpeta de datos).
  if (!(ELEVATED as readonly string[]).includes(operation ?? '')) {
    process.stderr.write(`Operación desconocida: ${String(operation)}. Use ${ELEVATED.join(', ')}.\n`);
    process.exitCode = 2;
    return;
  }
  // Antes que nada (también el diario): la carpeta de datos solo para el sistema y los administradores.
  await windowsSys.lockDown(l.data);
  const progress = await progressTo(pipe);
  let outcome: Outcome;
  try {
    outcome = await main(progress);
  } catch (err) {
    outcome = fail('inicio', err instanceof Error ? err.message : String(err));
  }
  progress.send({ type: 'outcome', outcome });
  await progress.close();
  process.exitCode = outcome.ok ? 0 : 1;
})();
