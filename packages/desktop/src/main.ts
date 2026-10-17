import { app, BrowserWindow, net, protocol } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ORIGIN, resolveAppFile } from './app-protocol.ts';

// shortcut: build de web en el monorepo; el instalador (T117) lo empaqueta junto a la app.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
// El logo (generado por pnpm --filter @impocaribe/web brand-icons); el .ico del instalador llega con T117.
const icon = fileURLToPath(new URL('../resources/icon.png', import.meta.url));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Sin await de nivel superior: en un main ESM, "ready" no llega hasta que el módulo termina de evaluarse.
void app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const file = resolveAppFile(request.url, webDist);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('No encontrado', { status: 404 });
  });
  return new BrowserWindow({ width: 1280, height: 800, icon }).loadURL(`${APP_ORIGIN}/index.html`);
});
app.on('window-all-closed', () => app.quit());
