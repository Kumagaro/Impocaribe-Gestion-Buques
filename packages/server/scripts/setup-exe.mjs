// T126 · DT-17 (decisión del responsable del 2026-10-27): impocaribe-setup.exe, el ayudante en un solo ejecutable con
// Node SEA. Empaqueta src/setup/main.ts y lo que usa en un único CommonJS, genera el blob con el mismo node.exe que lo
// llevará (la versión tiene que coincidir) y lo inyecta en una copia de ese node.exe.
//   node scripts/setup-exe.mjs <node.exe> <salida.exe>
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const [nodeExe, output] = process.argv.slice(2);
if (!nodeExe || !output) throw new Error('Uso: node scripts/setup-exe.mjs <node.exe> <salida.exe>');
const server = fileURLToPath(new URL('..', import.meta.url));
const work = join(server, 'dist-setup');
mkdirSync(work, { recursive: true });

await build({
  entryPoints: [join(server, 'src/setup/main.ts')],
  outfile: join(work, 'setup.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  // shared se toma de su código fuente (como en desarrollo), sin depender de su dist.
  conditions: ['source'],
  legalComments: 'none',
});

const config = join(work, 'sea-config.json');
writeFileSync(
  config,
  JSON.stringify({
    main: join(work, 'setup.cjs'),
    output: join(work, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
  }),
);
execFileSync(nodeExe, ['--experimental-sea-config', config], { stdio: 'inherit' });
copyFileSync(nodeExe, output);
// La firma Authenticode de node.exe deja de valer al inyectar: Windows mostrará «Editor desconocido» (decidido).
execFileSync(
  process.execPath,
  [
    join(server, 'node_modules/postject/dist/cli.js'),
    output,
    'NODE_SEA_BLOB',
    join(work, 'sea-prep.blob'),
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    '--overwrite',
  ],
  { stdio: 'inherit' },
);
console.log(`Ayudante listo: ${output}`);
