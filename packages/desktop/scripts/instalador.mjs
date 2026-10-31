// T117 · DT-16: construye un instalador (`ligero`, por defecto, o `completo`) con electron-builder. Antes: el build de
// shared, web y desktop (el script `instalador` de package.json los hace).
// La clave de firma está en el .env de la raíz del repositorio.
if (!process.env.IMPOCARIBE_FIRMA_CLAVE) process.loadEnvFile(new URL('../../../.env', import.meta.url));
process.env.IMPOCARIBE_INSTALADOR = process.argv[2] === 'completo' ? 'completo' : 'ligero';
const { build } = await import('electron-builder');
const { default: config } = await import('../electron-builder.config.mjs');
await build({ config, publish: 'never' });
