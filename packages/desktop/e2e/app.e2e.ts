// T115 · plan §10.1 y §11.2: la app de escritorio de verdad (Electron con el build de web), con un perfil propio. La
// interfaz arranca sin servidor (RF-CON-01, DT-02) y solo ve el puente del preload: el almacenamiento seguro, la copia
// local en SQLCipher (que no deja salir de la base), el descubrimiento y una red que no sale sin el servidor esperado.
import { _electron, expect, test, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
let app: ElectronApplication;
/**
 * T117: con IMPOCARIBE_APP_EXE, la app empaquetada (release/ligero/win-unpacked/impocaribe.exe); si no, el código
 * compilado con el Electron del monorepo.
 */
const packaged = process.env.IMPOCARIBE_APP_EXE;
const launch = () =>
  packaged
    ? { executablePath: packaged, args: [`--user-data-dir=${profile}`] }
    : {
        executablePath: createRequire(import.meta.url)('electron') as string,
        args: ['.', `--user-data-dir=${profile}`],
      };
let profile = '';

test.beforeAll(async () => {
  profile = mkdtempSync(join(tmpdir(), 'impocaribe-electron-'));
  app = await _electron.launch({
    ...launch(),
    cwd: root,
    // VS Code deja ELECTRON_RUN_AS_NODE=1 en el entorno de sus terminales: con ella, Electron arranca como Node.
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')) as Record<
      string,
      string
    >,
  });
});

test.afterAll(async () => {
  await app.close();
});

test('arranca sin servidor, con la plataforma de escritorio y solo el puente nativo', async () => {
  const page = await app.firstWindow();
  // Sin emparejar: P-01 busca el servidor con el descubrimiento nativo.
  await expect(page.getByRole('heading', { name: 'Buscando el servidor' })).toBeVisible({ timeout: 30_000 });
  const seen = await page.evaluate(async () => {
    const n = (window as unknown as { impocaribeNative: import('@impocaribe/shared').NativeBridge }).impocaribeNative;
    const fail = (p: Promise<unknown>) =>
      p.then(
        () => 'PERMITIDO',
        (e: Error) => e.message,
      );
    await n.invoke('secure.set', 'prueba', 'secreto');
    const db = (await n.invoke('db.open', 'humo')) as number;
    await n.invoke('db.execute', db, 'CREATE TABLE t (v TEXT)');
    await n.invoke('db.execute', db, 'INSERT INTO t VALUES (?)', ['EAGLE1-2026-V1-0042']);
    return {
      node: typeof (window as unknown as { require?: unknown }).require,
      info: n.info,
      secret: await n.invoke('secure.get', 'prueba'),
      rows: await n.invoke('db.query', db, 'SELECT v FROM t'),
      attach: await fail(n.invoke('db.execute', db, "ATTACH DATABASE 'fuera.db' AS x")),
      otherChannel: await fail(n.invoke('fs.read' as never, 'C:/Windows/win.ini')),
      subnet: ((await n.invoke('discovery.subnet')) as string[]).length,
      noServer: await fail(
        n.invoke('http', 'https://127.0.0.1:8443/api/v1/health', { method: 'GET', headers: {}, body: null }),
      ),
    };
  });
  expect(seen).toMatchObject({
    node: 'undefined',
    info: { platform: 'windows', appVersion: '0.0.0', smallestWidthDp: 1024 },
    secret: 'secreto',
    rows: [{ v: 'EAGLE1-2026-V1-0042' }],
    otherChannel: 'Canal no permitido: fs.read',
  });
  expect(seen.attach).toContain('Sentencia no permitida en la copia local.');
  expect(seen.noServer).toContain('No se sabe qué servidor debe responder');
  expect(seen.subnet).toBeGreaterThan(0);

  // En el perfil: el almacenamiento seguro y la base, sin nada en claro.
  const files = readdirSync(profile);
  expect(files).toEqual(expect.arrayContaining(['secure.json', 'humo.db']));
  expect(readFileSync(join(profile, 'secure.json'), 'utf8')).not.toContain('secreto');
  const raw = readFileSync(join(profile, 'humo.db'));
  expect(raw.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
});

test('T116 · cerrar la ventana la oculta en la bandeja y la interfaz sigue viva (RF-ALR-01)', async () => {
  const page = await app.firstWindow();
  const state = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.close();
    return { visible: w.isVisible(), destroyed: w.isDestroyed(), count: BrowserWindow.getAllWindows().length };
  });
  expect(state).toEqual({ visible: false, destroyed: false, count: 1 });
  // Oculta, la interfaz sigue corriendo: con backgroundThrottling apagado, Chromium la sigue tratando como visible y no
  // frena sus temporizadores ni su conexión de alertas.
  expect(await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.visibilityState), 300)))).toBe(
    'visible',
  );
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show());
});

test('una segunda apertura no crea otra ventana', async () => {
  const second = await _electron
    .launch({
      ...launch(),
      cwd: root,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')) as Record<
        string,
        string
      >,
    })
    .catch(() => null);
  // La segunda instancia se cierra sola (requestSingleInstanceLock): o no llega a conectarse o no tiene ventanas.
  if (second) {
    await expect.poll(() => second.windows().length, { timeout: 5_000 }).toBe(0);
    await second.close().catch(() => undefined);
  }
  expect(app.windows()).toHaveLength(1);
});
