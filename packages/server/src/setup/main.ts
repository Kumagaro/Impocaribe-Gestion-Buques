// T126 · DT-17 y plan §10.3: impocaribe-setup.exe, el ayudante de instalación. La app de escritorio lo lanza con permiso
// de administrador de Windows:
//   impocaribe-setup.exe crear|reparar|deshacer [--tuberia \\.\pipe\<nombre>]
// y por la tubería le manda {network, code} (crear) o {code} (reparar). Va dentro de server-bundle, que es de donde
// copia el programa. Al crear, el código se compara con la comprobación que trae el instalador; al reparar, con la que
// guarda el servidor (RF-INS-02).
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canCreateServer, checkServerPc } from '@impocaribe/shared';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import { verifySecret } from '../auth/password.ts';
import { runSteps, undoSteps, type Outcome } from './engine.ts';
import { gatherFacts } from './facts.ts';
import { fileJournal, journalPath } from './journal.ts';
import { appDatabaseUrl, layout, paths } from './layout.ts';
import { progressTo } from './progress.ts';
import { createSteps } from './steps.ts';
import { windowsSys } from './windows-sys.ts';

/** Reparar rehace estos pasos sin tocar la base ni la identidad (plan §10.3). */
export const REPAIR = ['copiar', 'servicio-base', 'servicio', 'firewall', 'energia', 'arranque'];

const operation = process.argv[2];
const pipeAt = process.argv.indexOf('--tuberia');
const pipe = pipeAt > 0 ? process.argv[pipeAt + 1] : undefined;
const bundle = dirname(process.execPath);
const l = layout();

// Antes que nada (también el diario): la carpeta de datos solo para el sistema y los administradores.
await windowsSys.lockDown(l.data);
const progress = await progressTo(pipe);
const fail = (step: string, error: string): Outcome => ({ ok: false, step, error });

async function main(): Promise<Outcome> {
  const request = (await progress.request) as { network?: unknown; code?: unknown };
  const code = installationCodeSchema.safeParse(String(request.code ?? ''));
  const journal = fileJournal(journalPath());
  const report = progress.send;

  if (operation === 'deshacer')
    return undoSteps(
      'create',
      createSteps(windowsSys, l, { bundle, network: 'router', codeHash: '' }),
      journal,
      report,
    );

  if (operation === 'crear') {
    const codeHash = (await readFile(join(bundle, 'codigo-instalacion.hash'), 'utf8')).trim();
    if (!code.success || !(await verifySecret(codeHash, code.data)))
      return fail('permisos', 'INSTALL_CODE_INVALID: el código de instalación no es el de esta empresa.');
    const network = request.network === 'hotspot' ? 'hotspot' : 'router';
    const checks = checkServerPc(await gatherFacts());
    progress.send({ type: 'checks', checks });
    if (!canCreateServer(checks)) return fail('comprobacion', checks.find((c) => c.level === 'bad')!.title);
    return runSteps('create', createSteps(windowsSys, l, { bundle, network, codeHash }), journal, report);
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
    return runSteps('create', steps, journal, report, REPAIR);
  }

  return fail('inicio', `Operación desconocida: ${String(operation)}. Use crear, reparar o deshacer.`);
}

/** La conexión de la app a la base, de los secretos que guardó la instalación. */
async function databaseUrl(): Promise<string> {
  const { app } = JSON.parse(await readFile(join(paths(l).serviceDir, 'secretos.json'), 'utf8')) as { app: string };
  return appDatabaseUrl(app);
}

let outcome: Outcome;
try {
  outcome = await main();
} catch (err) {
  outcome = fail('inicio', err instanceof Error ? err.message : String(err));
}
progress.send({ type: 'outcome', outcome });
await progress.close();
process.exitCode = outcome.ok ? 0 : 1;
