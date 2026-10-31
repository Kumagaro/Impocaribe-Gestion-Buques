// T125 · DT-16 y plan §10.3: arma `server-bundle`, lo que el instalador completo copia a C:\Program Files\Impocaribe\Server
// (paso 1 del ayudante, T126): Node.js, PostgreSQL 16, chrome-headless-shell (los PDF), WinSW (el servicio de Windows)
// y el servidor con solo sus dependencias de producción. Todo sale de descargas oficiales que se indican en el .env:
//   IMPOCARIBE_BUNDLE_NODE    node-v24.x-win-x64.zip (o la carpeta descomprimida)
//   IMPOCARIBE_BUNDLE_PG      postgresql-16.x-windows-x64-binaries.zip (o la carpeta pgsql)
//   IMPOCARIBE_BUNDLE_WINSW   WinSW-x64.exe (v2.12.0)
//   IMPOCARIBE_CHROMIUM       opcional: la carpeta de chrome-headless-shell; si no, la de la caché de Puppeteer
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const repo = join(desktop, '..', '..');
if (!process.env.IMPOCARIBE_BUNDLE_NODE) process.loadEnvFile(join(repo, '.env'));
const out = join(desktop, 'server-bundle');

const need = (name) => {
  const v = process.env[name];
  if (!v || !existsSync(v)) throw new Error(`Falta ${name} en el .env, o no existe: ${v ?? '(sin definir)'}`);
  return v;
};

/** Una descarga en .zip se descomprime en una carpeta temporal (tar de Windows lee .zip); una carpeta se usa tal cual. */
const unpacked = (path) => {
  if (statSync(path).isDirectory()) return path;
  const dir = mkdtempSync(join(tmpdir(), 'impocaribe-bundle-'));
  execFileSync('tar', ['-xf', path, '-C', dir]);
  return dir;
};

/** La primera carpeta (hasta tres niveles) que contiene `file`. */
const find = (root, file, depth = 3) => {
  if (existsSync(join(root, file))) return root;
  if (depth === 0) return null;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const hit = find(join(root, e.name), file, depth - 1);
    if (hit) return hit;
  }
  return null;
};

const run = (cmd, args, cwd = repo) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
const version = (exe, args) => execFileSync(exe, args, { encoding: 'utf8' }).trim();

// Node.js: la misma versión mayor que en desarrollo (engines de la raíz), porque el servidor usa su argon2.
const nodeDir = find(unpacked(need('IMPOCARIBE_BUNDLE_NODE')), 'node.exe');
if (!nodeDir) throw new Error('IMPOCARIBE_BUNDLE_NODE no tiene node.exe.');
const nodeVersion = version(join(nodeDir, 'node.exe'), ['--version']);
if (!nodeVersion.startsWith('v24.')) throw new Error(`Hace falta Node.js 24; la descarga es ${nodeVersion}.`);

// PostgreSQL 16, de los binarios (zip) de EnterpriseDB: solo bin, lib y share (sin pgAdmin, documentación ni cabeceras).
const pgDir = find(unpacked(need('IMPOCARIBE_BUNDLE_PG')), join('bin', 'pg_ctl.exe'));
if (!pgDir) throw new Error('IMPOCARIBE_BUNDLE_PG no tiene bin\\pg_ctl.exe.');
const pgVersion = version(join(pgDir, 'bin', 'pg_ctl.exe'), ['--version']);
if (!/\) 16\./.test(pgVersion)) throw new Error(`Hace falta PostgreSQL 16; la descarga es «${pgVersion}».`);

// WinSW 2.x no tiene --version (y sin su .xml no arranca): la versión sale del recurso del .exe.
const winsw = need('IMPOCARIBE_BUNDLE_WINSW');
const winswVersion = version('powershell', [
  '-NoProfile',
  '-Command',
  `(Get-Item -LiteralPath '${winsw.replaceAll("'", "''")}').VersionInfo.FileVersion`,
]);
if (!winswVersion.startsWith('2.'))
  throw new Error(`Hace falta WinSW 2.x; la descarga es ${winswVersion || '(sin versión)'}.`);

// El mismo Chromium que usa el servidor en desarrollo (CHROMIUM_VERSION de pdf-engine.ts).
const engine = readFileSync(join(repo, 'packages/server/src/orders/pdf-engine.ts'), 'utf8');
const chromiumVersion = /CHROMIUM_VERSION = '([\d.]+)'/.exec(engine)?.[1];
const chromiumExe =
  process.env.IMPOCARIBE_CHROMIUM ??
  join(
    homedir(),
    '.cache/puppeteer/chrome-headless-shell',
    `win64-${chromiumVersion}`,
    'chrome-headless-shell-win64/chrome-headless-shell.exe',
  );
if (!existsSync(chromiumExe)) throw new Error(`No está chrome-headless-shell ${chromiumVersion} en ${chromiumExe}.`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// El servidor compilado, con shared y solo las dependencias de producción.
run('pnpm', ['--filter', '@impocaribe/shared', 'build']);
run('pnpm', ['--filter', '@impocaribe/server', 'build']);
run('pnpm', ['--filter', '@impocaribe/server', 'deploy', '--prod', join(out, 'server')]);

mkdirSync(join(out, 'node'));
cpSync(join(nodeDir, 'node.exe'), join(out, 'node', 'node.exe'));
for (const part of ['bin', 'lib', 'share']) cpSync(join(pgDir, part), join(out, 'pgsql', part), { recursive: true });
cpSync(dirname(chromiumExe), join(out, 'chromium'), { recursive: true });
mkdirSync(join(out, 'winsw'));
cpSync(winsw, join(out, 'winsw', 'WinSW-x64.exe'));
// T126: el ayudante (impocaribe-setup.exe), con el mismo node.exe que va en el paquete.
run('node', [
  join(repo, 'packages/server/scripts/setup-exe.mjs'),
  join(out, 'node', 'node.exe'),
  join(out, 'impocaribe-setup.exe'),
]);

const manifest = {
  node: nodeVersion,
  postgresql: pgVersion,
  chromium: chromiumVersion,
  winsw: winswVersion,
  server: JSON.parse(readFileSync(join(repo, 'packages/server/package.json'), 'utf8')).version,
};
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`server-bundle listo en ${out}:`, manifest);
