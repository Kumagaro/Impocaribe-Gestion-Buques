// T003 y T115 · plan §10.1: la app de escritorio. Una sola instancia; la interfaz se sirve con app://impocaribe (DT-02)
// en una ventana aislada (contextIsolation, sandbox) que solo habla con el proceso principal por el puente del preload.
// Lo nativo vive aquí: red con verificación de la identidad (DT-19), descubrimiento, almacenamiento seguro y SQLCipher.
import { app, BrowserWindow, dialog, ipcMain, net, Notification, protocol, safeStorage } from 'electron';
import type { NativeDeviceInfo, NativeSocketEvent } from '@impocaribe/shared';
import { writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ORIGIN, resolveAppFile } from './app-protocol.ts';
import { LocalDatabases } from './native/database.ts';
import { broadcast, browse, lanInterfaces, probe, subnetAddresses } from './native/discovery.ts';
import { registerNative } from './native/ipc.ts';
import { SecureStore } from './native/secure-storage.ts';
import { NativeTransport } from './native/transport.ts';

// shortcut: build de web en el monorepo; el instalador (T117) lo empaqueta junto a la app.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
// El logo (generado por pnpm --filter @impocaribe/web brand-icons); el .ico del instalador llega con T117.
const icon = fileURLToPath(new URL('../resources/icon.png', import.meta.url));
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url));
/** Solo para probar contra un servidor sin TLS (IMPOCARIBE_TLS=off); la app instalada siempre usa HTTPS. */
const plainHttp = process.env.IMPOCARIBE_TLS === 'off';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let window: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  // Una segunda apertura trae al frente la ventana que ya está.
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  // Sin await de nivel superior: en un main ESM, "ready" no llega hasta que el módulo termina de evaluarse.
  void app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const file = resolveAppFile(request.url, webDist);
      return file ? net.fetch(pathToFileURL(file).toString()) : new Response('No encontrado', { status: 404 });
    });

    const data = app.getPath('userData');
    const secure = new SecureStore(join(data, 'secure.json'), safeStorage);
    const databases = new LocalDatabases(data, secure);
    const emit = (id: number, event: NativeSocketEvent, payload?: string) =>
      window?.webContents.send('native:socket', id, event, payload);
    const transport = new NativeTransport(emit, () => new Date(), plainHttp);
    const info: NativeDeviceInfo = {
      platform: 'windows',
      appVersion: app.getVersion(),
      smallestWidthDp: 1024,
      name: hostname(),
    };
    ipcMain.on('native:info', (event) => (event.returnValue = info));
    registerNative((channel, fn) => ipcMain.handle(channel, fn), {
      transport,
      secure,
      databases,
      discovery: {
        browse: (ms) => browse(ms),
        broadcast: (ms) => broadcast(ms),
        probe: (address, port, ms) => probe(address, port, ms, plainHttp ? 'http' : 'https'),
        subnet: () => subnetAddresses(lanInterfaces()),
      },
      saveFile: async (name, bytes) => {
        const { canceled, filePath } = await dialog.showSaveDialog(window!, { defaultPath: name });
        if (!canceled && filePath) await writeFile(filePath, bytes);
      },
      notify: (title, body) => new Notification({ title, body, icon }).show(),
      secureScreen: (enabled) => window?.setContentProtection(enabled),
    });
    app.on('before-quit', () => {
      transport.closeAll();
      databases.closeAll();
    });

    window = new BrowserWindow({
      width: 1280,
      height: 800,
      icon,
      webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    // Nada fuera de la app: ni navegación ni ventanas nuevas (Const. art. X).
    window.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(APP_ORIGIN)) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return window.loadURL(`${APP_ORIGIN}/index.html`);
  });
  app.on('window-all-closed', () => app.quit());
}
