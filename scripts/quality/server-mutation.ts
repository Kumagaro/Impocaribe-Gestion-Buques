// Plan §11.3: la mutación del servidor (lenta, contra PostgreSQL real) corre en verify solo si la rama toca un módulo
// crítico, sus pruebas o la configuración de Stryker. La completa corre cada noche en CI.
import { execFileSync, spawnSync } from 'node:child_process';
import { matchesGlob } from 'node:path';

const SERVER = 'packages/server/';

/** ¿Alguno de los archivos cambiados afecta a la mutación del servidor? `mutate` son los globs de Stryker. */
export function needsServerMutation(changed: string[], mutate: string[]): boolean {
  const include = mutate.filter((g) => !g.startsWith('!'));
  return changed.some((file) => {
    if (!file.startsWith(SERVER)) return false;
    const path = file.slice(SERVER.length);
    if (path === 'stryker.config.mjs') return true;
    // Las pruebas que están junto a un módulo crítico también cuentan: debilitarlas baja la mutación.
    const source = path.replace(/\.(int\.)?test\.ts$/, '.ts');
    return include.some((glob) => matchesGlob(source, glob));
  });
}

function git(...args: string[]): string[] {
  return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
}

if (import.meta.main) {
  let changed: string[] | null;
  try {
    const base = git('merge-base', 'HEAD', 'main')[0]!;
    changed = [...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')];
  } catch {
    changed = null; // sin main con qué comparar: se muta por seguridad
  }
  const { default: config } = (await import('../../packages/server/stryker.config.mjs')) as {
    default: { mutate: string[] };
  };
  if (changed && !needsServerMutation(changed, config.mutate)) {
    console.log('Mutación del servidor: la rama no toca módulos críticos; se omite (corre completa cada noche en CI).');
    process.exit(0);
  }
  const r = spawnSync('pnpm', ['--filter', '@impocaribe/server', 'mutation'], { stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}
