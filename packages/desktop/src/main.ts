import { app, BrowserWindow, net, protocol } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ORIGIN, resolveAppFile } from './app-protocol.ts';

// shortcut: build de web en el monorepo; el instalador (T117) lo empaqueta junto a la app.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

await app.whenReady();
protocol.handle('app', (request) => {
  const file = resolveAppFile(request.url, webDist);
  return file ? net.fetch(pathToFileURL(file).toString()) : new Response('No encontrado', { status: 404 });
});
const win = new BrowserWindow({ width: 1280, height: 800 });
await win.loadURL(`${APP_ORIGIN}/index.html`);
app.on('window-all-closed', () => app.quit());
