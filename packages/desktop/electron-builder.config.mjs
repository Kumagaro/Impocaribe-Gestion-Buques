// T117 · DT-16, RF-INS-01 y plan §10.1: los instaladores NSIS de Windows. El ligero es solo la app (se publica en el
// servidor, T113); el completo lleva además `server-bundle` (PostgreSQL, Node.js, Chromium y el servidor, que arma
// T125) y no se publica. Cada instalador sale con su SHA-256. IMPOCARIBE_INSTALADOR=completo elige el completo.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const flavor = process.env.IMPOCARIBE_INSTALADOR === 'completo' ? 'completo' : 'ligero';

if (flavor === 'completo' && !existsSync('server-bundle'))
  throw new Error('Falta la carpeta server-bundle: la arma el paquete de distribución (T125).');

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** @type {import('electron-builder').Configuration} */
export default {
  appId: 'cu.impocaribe.ordenes',
  productName: 'Órdenes de Carga',
  executableName: 'impocaribe',
  directories: { output: `release/${flavor}`, buildResources: 'resources' },
  // Solo lo que corre: el código compilado (sin mapas ni tipos) y el logo.
  files: [
    'package.json',
    'dist/**/*.js',
    'dist/**/*.cjs',
    'resources/icon.png',
    // De SQLCipher, solo el binario de Windows x64: ni sus fuentes ni los de otros sistemas.
    '!node_modules/better-sqlite3-multiple-ciphers/{deps,src}/**',
    '!node_modules/better-sqlite3-multiple-ciphers/prebuilds/{darwin,linux,linuxmusl}-*.node',
    '!node_modules/better-sqlite3-multiple-ciphers/prebuilds/win32-arm64.node',
  ],
  // El binario de SQLCipher es Node-API y precompilado: no se recompila, pero va fuera del asar para poder cargarse.
  npmRebuild: false,
  asarUnpack: ['**/*.node'],
  extraResources: [
    { from: '../web/dist', to: 'web' },
    ...(flavor === 'completo' ? [{ from: 'server-bundle', to: 'server-bundle' }] : []),
  ],
  // La app sabe qué instalador la puso: solo el completo ofrece «Crear servidor en este equipo» (P-28).
  extraMetadata: { impocaribe: { instalador: flavor } },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'resources/icon.png' },
  nsis: {
    oneClick: false,
    // El completo instala el servidor para todo el equipo; el ligero, para quien lo instala.
    perMachine: flavor === 'completo',
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'Órdenes de Carga',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    artifactName: flavor === 'completo' ? 'impocaribe-completo-${version}.exe' : 'impocaribe-${version}.exe',
  },
  // DT-16: cada instalador con su SHA-256 al lado.
  afterAllArtifactBuild: async (result) => {
    const written = [];
    for (const file of result.artifactPaths.filter((f) => f.endsWith('.exe'))) {
      await writeFile(`${file}.sha256`, `${await sha256(file)}  ${basename(file)}\n`);
      written.push(`${file}.sha256`);
    }
    return written;
  },
};
