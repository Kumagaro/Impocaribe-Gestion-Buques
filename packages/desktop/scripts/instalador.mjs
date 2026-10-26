// T117 · DT-16: construye un instalador (`ligero`, por defecto, o `completo`) con electron-builder. Antes: el build de
// shared, web y desktop (el script `instalador` de package.json los hace).
process.env.IMPOCARIBE_INSTALADOR = process.argv[2] === 'completo' ? 'completo' : 'ligero';
const { build } = await import('electron-builder');
const { default: config } = await import('../electron-builder.config.mjs');
await build({ config, publish: 'never' });
