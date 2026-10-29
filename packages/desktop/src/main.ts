// T003, T115 y T116 · plan §10.1: la app de escritorio. Una sola instancia; la interfaz se sirve con app://impocaribe
// (DT-02) en una ventana aislada (contextIsolation, sandbox) que solo habla con el proceso principal por el puente del
// preload. Lo nativo vive aquí: red con verificación de la identidad (DT-19), descubrimiento, almacenamiento seguro,
// SQLCipher y la bandeja: cerrar la ventana la oculta y las alertas siguen llegando (RF-ALR-01).
import { app, BrowserWindow, dialog, ipcMain, Menu, net, Notification, protocol, safeStorage, Tray } from 'electron';
import type { NativeDeviceInfo, NativeSocketEvent } from '@impocaribe/shared';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ORIGIN, resolveAppFile } from './app-protocol.ts';
import { LocalDatabases } from './native/database.ts';
import { broadcast, browse, lanInterfaces, probe, subnetAddresses } from './native/discovery.ts';
import { registerNative } from './native/ipc.ts';
import { SecureStore } from './native/secure-storage.ts';
import { NativeTransport } from './native/transport.ts';
import { SetupHelper } from './system/setup.ts';
import { ServerPcGuard, windowsShutdownBlocker } from './system/shutdown.ts';
import { hideOnClose, loginItem, saveFilters, startsHidden, trayMenu } from './system/tray.ts';
import { downloadUpdate, installerPath, resolveUpdate, verifySignature } from './system/updater.ts';

/** Donde la interfaz guarda el emparejamiento (web/src/connection/pairing.ts). */
const PAIRING_KEY = 'impocaribe.pairing';
/** T133 · RF-INS-10: si ya se decidió el inicio con Windows (la app lo activa una vez en la PC servidor). */
const AUTOSTART_KEY = 'impocaribe.autostart-decided';

// T117: instalada, la interfaz va en los recursos de la app (extraResources); en desarrollo, el build de web del monorepo.
const webDist = app.isPackaged
  ? join(process.resourcesPath, 'web')
  : fileURLToPath(new URL('../../web/dist', import.meta.url));
// El logo (generado por pnpm --filter @impocaribe/web brand-icons), dentro de la app.
const icon = fileURLToPath(new URL('../resources/icon.png', import.meta.url));
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url));
/** T117: la clave pública Ed25519 con que se firman los instaladores (la privada solo la tiene el build). */
const signingKey = fileURLToPath(new URL('../resources/firma-publica.pem', import.meta.url));
/** Solo para probar contra un servidor sin TLS (IMPOCARIBE_TLS=off); la app instalada siempre usa HTTPS. */
const plainHttp = process.env.IMPOCARIBE_TLS === 'off' && !app.isPackaged;
/**
 * T127: el ayudante de instalación va en el server-bundle; solo el instalador completo lo trae y lo dice en los
 * metadatos de la app (electron-builder.config.mjs). En desarrollo, el que indique IMPOCARIBE_SETUP_EXE.
 */
const setupExe = app.isPackaged
  ? join(process.resourcesPath, 'server-bundle', 'impocaribe-setup.exe')
  : process.env.IMPOCARIBE_SETUP_EXE;
const installer = (
  JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { impocaribe?: { instalador?: string } }
).impocaribe?.instalador;
const serverInstaller = !!setupExe && existsSync(setupExe) && (!app.isPackaged || installer === 'completo');
/** T129: la versión del servidor que trae el instalador completo (manifest.json de server-bundle). */
const serverBundleVersion = (() => {
  try {
    return (JSON.parse(readFileSync(join(dirname(setupExe!), 'manifest.json'), 'utf8')) as { server?: string }).server;
  } catch {
    return undefined;
  }
})();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
/** T133 · P-31: el aviso al apagar la PC servidor (se crea con la ventana, que es la que lleva el motivo). */
let serverPc: ServerPcGuard | null = null;
/** «Salir», el apagado o la actualización: entonces cerrar la ventana sí cierra la app. */
let quitting = false;

const show = () => {
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
  // Una segunda apertura trae al frente la ventana que ya está (también si estaba en la bandeja).
  app.on('second-instance', show);
  app.on('before-quit', () => (quitting = true));

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
      ...(plainHttp ? { plainHttp } : {}),
      ...(serverInstaller ? { serverInstaller } : {}),
      ...(serverInstaller && serverBundleVersion ? { serverBundleVersion } : {}),
    };
    // P-28: el progreso va a la ventana; si se cierra (queda en la bandeja) la creación sigue, y al volver se retoma.
    const setup = serverInstaller
      ? new SetupHelper(setupExe!, (m) => window?.webContents.send('native:setup-message', m))
      : null;
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
        // RF-ORD-22: «Guardar como», con el filtro de su tipo (el PDF de la orden).
        const { canceled, filePath } = await dialog.showSaveDialog(window!, {
          defaultPath: name,
          filters: saveFilters(name),
        });
        if (!canceled && filePath) await writeFile(filePath, bytes);
      },
      notify: (title, body) => {
        // RF-ALR-01: también con la ventana oculta; tocarla trae la app al frente.
        const n = new Notification({ title, body, icon });
        n.on('click', show);
        n.show();
      },
      secureScreen: (enabled) => window?.setContentProtection(enabled),
      serverPc: (devices) => serverPc?.update(devices),
      // T130: el archivo de traslado que se abre en P-28 y la carpeta donde se guarda en P-29 (una USB, normalmente).
      pickFile: async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(window!, {
          title: 'Archivo de traslado',
          filters: [{ name: 'Respaldo de traslado', extensions: ['icmove'] }],
          properties: ['openFile'],
        });
        return canceled ? null : (filePaths[0] ?? null);
      },
      pickFolder: async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(window!, {
          title: 'Guardar el archivo de traslado en',
          properties: ['openDirectory', 'createDirectory'],
        });
        return canceled ? null : (filePaths[0] ?? null);
      },
      // AL-22: una solicitud de emparejamiento nueva trae la ventana al frente, aunque esté en la bandeja.
      attention: () => {
        show();
        window?.flashFrame(true);
      },
      setup,
      // T117 · RF-UPD-05: descarga del servidor emparejado, comprueba la huella y la firma del proyecto, y abre el
      // instalador (que pide la confirmación del usuario); la app se cierra para que pueda reemplazarla.
      installUpdate: async ({ version }) => {
        const { url, sha256, signature, server } = await resolveUpdate(
          version,
          app.getVersion(),
          secure.get(PAIRING_KEY),
          async (checkUrl, expected) => {
            const res = await transport.http(
              checkUrl,
              {
                method: 'GET',
                headers: { 'X-App-Version': app.getVersion(), 'X-App-Platform': 'windows' },
                body: null,
              },
              expected,
            );
            if (res.status !== 200 || !res.body) throw new Error('El servidor no dijo qué versión está publicada.');
            return JSON.parse(new TextDecoder().decode(res.body)) as {
              latest: string | null;
              sha256: string | null;
              signature: string | null;
            };
          },
        );
        const file = await downloadUpdate(
          url,
          server,
          sha256,
          installerPath(join(data, 'actualizaciones'), version),
          (received, total) => window?.webContents.send('native:update-progress', received, total),
        );
        // La firma del proyecto, con la clave pública que trae la app: si no es válida, el instalador no se abre.
        try {
          verifySignature(sha256, signature, readFileSync(signingKey, 'utf8'));
        } catch (err) {
          await rm(file, { force: true });
          throw err;
        }
        spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
        quitting = true;
        app.quit();
      },
    });
    app.on('before-quit', () => {
      transport.closeAll();
      databases.closeAll();
    });

    window = new BrowserWindow({
      width: 1280,
      height: 800,
      icon,
      show: !startsHidden(process.argv),
      // Oculta en la bandeja, la interfaz sigue sincronizando y recibiendo alertas: sin frenar sus temporizadores.
      webPreferences: {
        preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    window.on('close', (event) => {
      if (!hideOnClose(quitting)) return;
      event.preventDefault();
      window?.hide();
    });
    // T133 · P-31: en la PC servidor, Windows muestra el motivo y «Apagar de todos modos» (RF-INS-09).
    window.on('query-session-end', (event) => {
      if (serverPc?.shouldBlock()) event.preventDefault();
    });

    tray = new Tray(icon);
    tray.setToolTip('Órdenes de Carga');
    const refreshMenu = () =>
      tray?.setContextMenu(
        Menu.buildFromTemplate(
          trayMenu(app.getLoginItemSettings().openAtLogin, {
            open: show,
            setStartWithWindows: (enabled) => {
              app.setLoginItemSettings(loginItem(enabled));
              void secure.set(AUTOSTART_KEY, '1');
              refreshMenu();
            },
            quit: () => app.quit(),
          }),
        ),
      );
    refreshMenu();
    tray.on('click', show);
    if (process.platform === 'win32')
      void windowsShutdownBlocker(window.getNativeWindowHandle()).then(
        (blocker) =>
          (serverPc = new ServerPcGuard(blocker, {
            // RF-INS-10: la PC servidor arranca la app con Windows; si alguien lo quita después, se respeta.
            configured: () => secure.get(AUTOSTART_KEY) !== null,
            enable: () => {
              app.setLoginItemSettings(loginItem(true));
              void secure.set(AUTOSTART_KEY, '1');
              refreshMenu();
            },
          })),
      );
    // Nada fuera de la app: ni navegación ni ventanas nuevas (Const. art. X).
    window.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(APP_ORIGIN)) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return window.loadURL(`${APP_ORIGIN}/index.html`);
  });
  // Con la ventana oculta la app sigue en la bandeja; solo «Salir» la cierra.
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });
}
