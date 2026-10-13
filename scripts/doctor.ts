// T001 · plan §13.1: comprueba el equipo de desarrollo y explica cómo corregir lo que falte.
// Se ejecuta con `pnpm run doctor`: pnpm 12 reserva `pnpm doctor` para sí (Node 24 ejecuta TypeScript directamente).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JDK_MAJOR = 21; // Capacitor 8 exige JDK 21
const PG_MAJOR = 16;
const ANDROID_APIS = [24, 34]; // Android 7 y Android 14 (plan §13.1)
const ANDROID_COMPILE_SDK = 36; // compileSdkVersion de packages/android/android/variables.gradle

type Check = { name: string; ok: boolean; detail: string; fix?: string };
const checks: Check[] = [];

function run(cmd: string): string | null {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.trim();
}

function major(text: string | null): number | null {
  const m = text?.match(/(\d+)(?:\.\d+)*/);
  return m ? Number(m[1]) : null;
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  engines: { node: string };
  packageManager: string;
};

// Node
const nodeWanted = major(pkg.engines.node)!;
const nodeMajor = major(process.versions.node)!;
checks.push({
  name: 'Node.js',
  ok: nodeMajor === nodeWanted,
  detail: `v${process.versions.node} (se pide ${nodeWanted} LTS, fijada en .nvmrc)`,
  fix: `Instale Node.js ${nodeWanted} LTS: winget install OpenJS.NodeJS.LTS`,
});

// pnpm
const pnpmWanted = pkg.packageManager.replace('pnpm@', '');
const pnpmVersion = run('pnpm --version');
checks.push({
  name: 'pnpm',
  ok: pnpmVersion === pnpmWanted,
  detail: pnpmVersion ? `${pnpmVersion} (se pide ${pnpmWanted})` : 'no encontrado',
  fix: `npm install -g pnpm@${pnpmWanted}   (o: corepack enable, como administrador)`,
});

// Git
const gitVersion = run('git --version');
const autocrlf = run('git config --get core.autocrlf') ?? '(sin definir)';
checks.push({
  name: 'Git',
  ok: gitVersion !== null && autocrlf === 'false',
  detail: gitVersion ? `${gitVersion}, core.autocrlf=${autocrlf}` : 'no encontrado',
  fix: gitVersion
    ? 'git config --global core.autocrlf false   (los finales de línea los fija .gitattributes)'
    : 'winget install Git.Git',
});

// PostgreSQL
const psql = run('psql --version');
const pgReady = run('pg_isready -h localhost');
checks.push({
  name: `PostgreSQL ${PG_MAJOR}`,
  ok: major(psql?.replace(/^\D+/, '') ?? null) === PG_MAJOR && pgReady !== null,
  detail: psql
    ? `${psql}; servicio ${pgReady ? 'aceptando conexiones' : 'sin respuesta en localhost:5432'}`
    : 'psql no encontrado en el PATH',
  fix: `winget install PostgreSQL.PostgreSQL.${PG_MAJOR}  y añada "C:\\Program Files\\PostgreSQL\\${PG_MAJOR}\\bin" al PATH. Si ya está instalado, arranque el servicio postgresql-x64-${PG_MAJOR}`,
});

// JDK
const java = run('java -version');
const javaMajor = major(java?.match(/version "(?:1\.)?([^"]+)"/)?.[1] ?? null); // "1.8.0" es Java 8
checks.push({
  name: `JDK ${JDK_MAJOR}`,
  ok: javaMajor === JDK_MAJOR,
  detail: java ? `java ${javaMajor}` : 'java no encontrado',
  fix: `winget install Microsoft.OpenJDK.${JDK_MAJOR}  y defina JAVA_HOME apuntando a esa instalación (debe ir antes que otros Java en el PATH)`,
});

// Android SDK y emuladores
const sdk =
  process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const sdkOk =
  existsSync(join(sdk, 'platform-tools')) && existsSync(join(sdk, 'platforms', `android-${ANDROID_COMPILE_SDK}`));
checks.push({
  name: 'Android SDK',
  ok: sdkOk && !!(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT),
  detail: sdkOk ? sdk : `no encontrado (o sin la plataforma android-${ANDROID_COMPILE_SDK})`,
  fix: 'winget install Google.AndroidStudio, abra Android Studio una vez para descargar el SDK y defina ANDROID_HOME (ver docs/desarrollo.md)',
});

const avdDir = process.env.ANDROID_AVD_HOME ?? join(homedir(), '.android', 'avd');
const avdApis = existsSync(avdDir)
  ? readdirSync(avdDir)
      .filter((f) => f.endsWith('.ini'))
      .map((f) => readFileSync(join(avdDir, f), 'utf8').match(/target=android-(\d+)/)?.[1])
      .map(Number)
  : [];
for (const api of ANDROID_APIS) {
  checks.push({
    name: `Emulador Android API ${api}`,
    ok: avdApis.includes(api),
    detail: avdApis.includes(api) ? 'existe' : 'no hay ningún AVD con esa API',
    fix: `Ver "Emuladores" en docs/desarrollo.md (sdkmanager "system-images;android-${api};google_apis;x86_64" y avdmanager create avd)`,
  });
}

for (const c of checks) {
  console.log(`${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`);
  if (!c.ok && c.fix) console.log(`    → ${c.fix}`);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} comprobación(es) fallida(s). Detalle en docs/desarrollo.md.` : '\nTodo listo.');
process.exit(failed ? 1 : 0);
