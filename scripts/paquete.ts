// T125 · RF-INS-01, RF-INS-02, DT-15 y DT-16: el paquete de distribución de una empresa.
//   pnpm paquete "Nombre de la empresa"
// Deja en paquete/<empresa>-<fecha>/ los tres instaladores (completo, ligero y APK) con su SHA-256, los instaladores del
// WebView y un LEEME; y aparte, fuera de esa carpeta, la hoja con el código de instalación para imprimirla. El código no
// va en ningún archivo del paquete: el instalador completo solo lleva su comprobación (argon2id).
// Necesita en el .env: las descargas de server-bundle (IMPOCARIBE_BUNDLE_*), la clave de firma de Windows
// (IMPOCARIBE_FIRMA_CLAVE), la del APK (IMPOCARIBE_APK_*) y la carpeta con los APK del WebView (IMPOCARIBE_WEBVIEW_APKS).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashSecret } from '../packages/server/src/auth/password.ts';
import { leaks, newInstallationCode } from './paquete/codigo.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
process.loadEnvFile(join(repo, '.env'));

const empresa = process.argv[2]?.trim();
if (!empresa) throw new Error('Uso: pnpm paquete "Nombre de la empresa"');
const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(new Date());
const slug = empresa
  .normalize('NFD')
  .replace(/[^\w]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase();
const out = join(repo, 'paquete', `${slug}-${fecha}`);
if (existsSync(out)) throw new Error(`Ya existe ${out}: bórrelo o espere al día siguiente.`);

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en el .env (vea .env.example).`);
  return v;
};
const run = (cmd: string, args: string[], cwd = repo, env: NodeJS.ProcessEnv = process.env) => {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')}`);
};
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
/** Copia al paquete con su .sha256 al lado (DT-16), y devuelve la línea del LEEME. */
const ship = (from: string, to: string) => {
  copyFileSync(from, to);
  const hash = sha256(to);
  writeFileSync(`${to}.sha256`, `${hash}  ${basename(to)}\n`);
  return `${relative(out, to)}\n  SHA-256 ${hash}`;
};
const files = function* (dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else yield p;
  }
};

// Lo que no está no se descubre a mitad del proceso.
for (const name of ['IMPOCARIBE_FIRMA_CLAVE', 'IMPOCARIBE_APK_KEYSTORE', 'IMPOCARIBE_APK_KEYSTORE_PASS']) need(name);
const webviewDir = need('IMPOCARIBE_WEBVIEW_APKS');
const webviews = readdirSync(webviewDir).filter((f) => f.toLowerCase().endsWith('.apk'));
if (webviews.length === 0) throw new Error(`No hay APK del WebView en ${webviewDir}.`);

const desktop = join(repo, 'packages/desktop');
const code = newInstallationCode();

// 1. server-bundle con la comprobación del código de esta empresa, y los dos instaladores de Windows.
run('pnpm', ['--filter', '@impocaribe/desktop', 'server-bundle']);
writeFileSync(join(desktop, 'server-bundle', 'codigo-instalacion.hash'), `${await hashSecret(code)}\n`);
run('pnpm', ['--filter', '@impocaribe/desktop', 'instalador']);
run('pnpm', ['--filter', '@impocaribe/desktop', 'instalador:completo']);

// 2. El APK firmado con la clave de la empresa (la misma siempre: si no, no se puede actualizar).
run('pnpm', ['--filter', '@impocaribe/web', 'build']);
run('pnpm', ['--filter', '@impocaribe/android', 'sync']);
run(
  process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew',
  ['assembleRelease'],
  join(repo, 'packages/android/android'),
);

// 3. Las comprobaciones de la tarea: el ligero no lleva el servidor y el código no está en ningún archivo.
const unpacked = (flavor: string) => join(desktop, 'release', flavor, 'win-unpacked', 'resources');
if (existsSync(join(unpacked('ligero'), 'server-bundle'))) throw new Error('El instalador ligero lleva server-bundle.');
if (!existsSync(join(unpacked('completo'), 'server-bundle')))
  throw new Error('El instalador completo no lleva server-bundle.');

// 4. El paquete.
const version = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version as string;
mkdirSync(join(out, 'webview'), { recursive: true });
const lines = [
  ship(
    join(desktop, 'release/completo', `impocaribe-completo-${version}.exe`),
    join(out, `impocaribe-completo-${version}.exe`),
  ),
  ship(join(desktop, 'release/ligero', `impocaribe-${version}.exe`), join(out, `impocaribe-${version}.exe`)),
  ship(
    join(repo, 'packages/android/android/app/build/outputs/apk/release/app-release.apk'),
    join(out, `impocaribe-${version}.apk`),
  ),
  ...webviews.map((f) => ship(join(webviewDir, f), join(out, 'webview', f))),
];
for (const flavor of ['completo', 'ligero']) {
  const sig = join(
    desktop,
    'release',
    flavor,
    `impocaribe${flavor === 'completo' ? '-completo' : ''}-${version}.exe.sig`,
  );
  copyFileSync(sig, join(out, basename(sig)));
}
writeFileSync(
  join(out, 'LEEME.txt'),
  [
    `Órdenes de Carga ${version} · ${empresa} · ${fecha}`,
    '',
    'impocaribe-completo: para la PC que será el servidor (pide el código de instalación, que va impreso aparte).',
    'impocaribe: para las demás PC.',
    'impocaribe .apk: para los teléfonos y tablets; webview/: el navegador interno para Android 7 a 9 (Chrome) y 10 o',
    'superior (Android System WebView), si la app lo pide.',
    '',
    ...lines,
    '',
  ].join('\n'),
);

const leaked = leaks(
  [out, join(desktop, 'server-bundle'), unpacked('completo'), unpacked('ligero')].flatMap((dir) =>
    [...files(dir)].map((path) => ({ path, bytes: readFileSync(path) })),
  ),
  code,
);
if (leaked.length > 0)
  throw new Error(`El código de instalación aparece en: ${leaked.join(', ')}. No entregue este paquete.`);

// 5. La hoja del código, fuera del paquete: se imprime y se borra.
const sheet = join(repo, 'paquete', `${slug}-${fecha}-CODIGO-IMPRIMIR-Y-BORRAR.html`);
writeFileSync(
  sheet,
  `<!doctype html><meta charset="utf-8"><title>Código de instalación</title>
<body style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:48px auto;color:#14202b">
<h1 style="font-size:22px">Órdenes de Carga · código de instalación</h1>
<p><b>${empresa}</b> · preparado el ${fecha.split('-').reverse().join('/')}</p>
<p style="font:700 40px Consolas,monospace;letter-spacing:.12em;border:2px solid #14202b;padding:16px;text-align:center">${code}</p>
<p>Se pide al crear el servidor y en su mantenimiento (reparar, actualizar, trasladar, desinstalar y el restablecimiento de
emergencia). Una Apoderada puede cambiarlo en Configuración.</p>
<p>Guarde esta hoja en un lugar seguro, separada de la PC servidor. No la fotografíe ni la guarde en el equipo.</p>
</body>`,
);
console.log(`\nPaquete listo en ${out}.`);
console.log(`Imprima ${sheet} y bórrelo después: es la única copia del código.`);
