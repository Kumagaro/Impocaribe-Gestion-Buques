// T126 · DT-17 y plan §10.3: impocaribe-setup.exe, el ayudante de instalación. La app de escritorio lo lanza con permiso
// de administrador de Windows:
//   impocaribe-setup.exe crear|reparar|deshacer|restablecer [--tuberia \\.\pipe\<nombre>]
// y por la tubería le manda {network, code} (crear), {code} (reparar) o {code, username, password} (restablecer). Va
// dentro de server-bundle, que es de donde copia el programa. Al crear, el código se compara con la comprobación que
// trae el instalador; al reparar, con la que guarda el servidor (RF-INS-02).
// T127: P-28 lo usa también sin elevar, antes de pedir el permiso (pasos 1 y 2):
//   impocaribe-setup.exe comprobar   escribe los datos de la PC (PcFacts) en JSON
//   impocaribe-setup.exe codigo      lee el código por la entrada y escribe «ok» o INSTALL_CODE_INVALID
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canCreateServer, checkServerPc } from '@impocaribe/shared';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import { verifySecret } from '../auth/password.ts';
import { runSteps, undoSteps, type Outcome, type Step } from './engine.ts';
import { gatherFacts } from './facts.ts';
import { fileJournal, journalPath } from './journal.ts';
import { appDatabaseUrl, layout, paths } from './layout.ts';
import { progressTo, type Progress } from './progress.ts';
import { createSteps } from './steps.ts';
import { windowsSys } from './windows-sys.ts';

/** Reparar rehace estos pasos sin tocar la base ni la identidad (plan §10.3). */
export const REPAIR = ['copiar', 'servicio-base', 'servicio', 'firewall', 'energia', 'arranque'];

const operation = process.argv[2];
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
  const request = (await progress.request) as { network?: unknown; code?: unknown };
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
    const steps = createSteps(windowsSys, l, { bundle, network, codeHash });
    plan(progress, steps);
    return runSteps('create', steps, journal, report);
  }

  if (operation === 'reparar') {
    // RF-INS-02: con el código que guarda el servidor (una Apoderada puede haberlo cambiado).
    const check = await windowsSys
      .run(paths(l).node, [join(l.program, 'server', 'dist', 'setup', 'tasks.js'), 'check-code'], {
        input: code.success ? code.data : '',
        env: { NODE_ENV: 'production', DATABASE_URL: await databaseUrl() },
      })
      .catch(() => 'INSTALL_CODE_INVALID');
    if (check.trim() !== 'ok')
      return fail('permisos', 'INSTALL_CODE_INVALID: el código de instalación no es correcto.');
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

  return fail('inicio', `Operación desconocida: ${String(operation)}. Use crear, reparar, deshacer o restablecer.`);
}

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
  const code = installationCodeSchema.safeParse(text.trim());
  const ok = code.success && (await verifySecret(await installerCodeHash(), code.data));
  process.stdout.write(ok ? 'ok\n' : 'INSTALL_CODE_INVALID\n');
  return ok ? 0 : 3;
}

// Sin «await» de nivel superior: el ejecutable (Node SEA) lleva el script en CommonJS.
void (async () => {
  if (operation === 'comprobar' || operation === 'codigo') {
    process.exitCode = await unelevated();
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
