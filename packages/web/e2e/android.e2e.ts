// T122 · RNF-02 y plan §11.2: la app Android real en un emulador (Android 7 o 14), contra el servidor de extremo a
// extremo: emparejar, iniciar sesión, primera sincronización, emitir una orden, recibir una alerta con la app cerrada
// y trabajar sin conexión. Playwright maneja la interfaz por el WebView (depurable en el APK de prueba) y el resto por
// adb. Los clics no esperan navegaciones (noWaitAfter): por el WebView no llegan los eventos de carga de la página
// y Playwright esperaría para siempre. Necesita el APK de prueba sin TLS (pnpm --filter @impocaribe/android apk:e2e), que habla con 10.0.2.2.
import { _android, type AndroidDevice, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { postUser } from '../src/api/endpoints/users';
import { confirmPairingCode } from './support/api';
import { E2E_IDENTITY, SERVER_PORT } from './support/env';
import { expect, test } from './support/fixtures';
import { havanaToday, prepare } from './support/orders';

const PKG = 'cu.impocaribe.ordenes';
const APK = fileURLToPath(new URL('../../android/android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url));
const OPERADOR = { username: 'android.operador', password: 'clave-android-1' };

/**
 * Un botón por su texto visible. Buscar por rol recorre la accesibilidad de toda la página: en el WebView del emulador
 * tarda segundos por consulta y, con la app ocupada, no llega a tiempo.
 */
const button = (page: Page, name: string) =>
  page.locator('button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });

const sh = async (device: AndroidDevice, cmd: string) => (await device.shell(cmd)).toString();

/** La interfaz de la app que está abierta (el WebView cambia de proceso si la app se cerró). */
async function appPage(device: AndroidDevice): Promise<Page> {
  const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 });
  return webview.page();
}

/**
 * Abre la app. Si su proceso sigue vivo (el servicio de alertas lo mantiene), Playwright devolvería la página anterior,
 * ya cerrada: la nueva llega como otra página de la misma conexión. Si Android terminó el proceso, la página está en
 * uno nuevo, con otra conexión.
 */
/**
 * Con el equipo cargado, el emulador a veces muestra «… isn't responding» (del lanzador, no de la app) encima de todo:
 * se cierran los diálogos del sistema antes de abrir la app.
 */
async function startApp(device: AndroidDevice) {
  await sh(device, 'am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS');
  await sh(device, `am start -n ${PKG}/.EntryActivity`);
}

async function launch(device: AndroidDevice, previous?: Page): Promise<Page> {
  if (!previous) {
    await startApp(device);
    return appPage(device);
  }
  const pid = async () => (await sh(device, `pidof ${PKG}`)).trim();
  const before = await pid();
  let sameProcess: Page | null = null;
  void previous
    .context()
    .waitForEvent('page', { timeout: 90_000 })
    .then(
      (p) => (sameProcess = p),
      () => undefined,
    );
  await startApp(device);
  let page: Page | null = null;
  await expect
    .poll(
      async () => {
        if (sameProcess) page = sameProcess;
        else if ((await pid()) !== before) page = await appPage(device);
        return page !== null && !page.isClosed();
      },
      { timeout: 90_000 },
    )
    .toBe(true);
  return page!;
}

/** La app sin ventana, como al quitarla de las recientes: el servicio de alertas sigue (RF-ALR-01). */
async function closeApp(device: AndroidDevice) {
  await sh(device, 'input keyevent KEYCODE_HOME');
  // Se repite hasta que no quede ninguna tarea de la app; si falla, el mensaje muestra la lista.
  await expect
    .poll(
      async () => {
        const tasks = await sh(device, 'am stack list');
        for (const m of tasks.matchAll(/taskId=(\d+):[^\n]*cu\.impocaribe\.ordenes/g))
          await sh(device, `am stack remove ${m[1]}`);
        return tasks.includes(PKG) ? tasks : '';
      },
      { timeout: 60_000 },
    )
    .toBe('');
}

const notifications = async (device: AndroidDevice) => sh(device, 'dumpsys notification --noredact');

test('la app Android: emparejar, entrar, sincronizar, emitir, alertas con la app cerrada y sin conexión', async ({
  sql,
}) => {
  const [device] = await _android.devices();
  if (!device) throw new Error('No hay ningún emulador ni teléfono conectado por adb.');
  try {
    // Datos de la prueba por API (con la Apoderada): el operador y lo que necesita una orden.
    const w = await prepare({
      code: 'AND',
      dm: '80434',
      plate: 'P804',
      nationalId: '84011905504',
      license: '80000000004',
    });
    await w.api.request(postUser, {
      body: {
        fullName: 'Prueba Android Operador',
        ...OPERADOR,
        confirm: OPERADOR.password,
        nationalId: '90010112399',
        phone: '52345699',
        role: 'operador',
      },
    });

    // La app recién instalada, sin datos; sin diálogos de permisos que tapen la interfaz.
    // Primero sin datos (si no, al reinstalar el servicio de alertas arrancaría con el token de la vez anterior) y con
    // el proceso detenido: la página que se busque después es la de esta apertura.
    await sh(device, `pm clear ${PKG}`);
    await device.installApk(APK);
    await sh(device, `am force-stop ${PKG}`);
    await sh(device, `pm grant ${PKG} android.permission.POST_NOTIFICATIONS`);
    await sh(device, `dumpsys deviceidle whitelist +${PKG}`);
    let page = await launch(device);
    const info = await page.evaluate(() =>
      (
        window as unknown as {
          Capacitor: { Plugins: { ImpocaribeNative: { info(): Promise<{ plainHttp?: boolean }> } } };
        }
      ).Capacitor.Plugins.ImpocaribeNative.info(),
    );
    expect(info.plainHttp, 'el APK tiene que ser el de prueba sin TLS (apk:e2e)').toBe(true);

    // P-01: el emulador no recibe la difusión del equipo: se empareja por la dirección del equipo (10.0.2.2), cuando
    // la búsqueda automática ya terminó (si no, sus sondas a la /24 compiten con la de la dirección escrita).
    await expect(page.getByText('No se encontró el servidor', { exact: true })).toBeVisible({ timeout: 90_000 });
    await button(page, 'Opciones avanzadas').click({ noWaitAfter: true });
    await page.getByLabel('Dirección').fill(`10.0.2.2:${SERVER_PORT}`);
    await button(page, 'Conectar').click({ noWaitAfter: true });
    await button(page, 'Emparejar con código').click({ noWaitAfter: true });
    await confirmPairingCode((await page.locator('.auth-code').textContent())!.replace(/\D/g, ''));
    await expect(page.locator('h1, h2').filter({ hasText: `Emparejado con ${E2E_IDENTITY.name}` })).toBeVisible();
    await button(page, 'Iniciar sesión').click({ noWaitAfter: true });

    // P-03 y la primera sincronización: el tablero trae la DM preparada.
    await page.getByLabel('Usuario').fill(OPERADOR.username);
    await page.getByLabel('Contraseña', { exact: true }).fill(OPERADOR.password);
    await button(page, 'Entrar').click({ noWaitAfter: true });
    await expect(page.locator('h1, h2').filter({ hasText: 'Tablero' }).first()).toBeVisible();
    // En el emulador (sin GPU) la primera sincronización tarda de 30 a 60 s aun con pocos datos.
    await expect(page.getByText('en 1 DM', { exact: true })).toBeVisible({ timeout: 120_000 });

    // P-13 en teléfono: emitir una orden (cuatro pasos). «Siguiente» y «Emitir» ocupan el mismo sitio: un toque en
    // «Siguiente» deja un clic retrasado que caería en «Emitir». Los pasos se pulsan sobre el elemento (sin toque).
    await page.evaluate(() => (location.hash = '#/ordenes/nueva'));
    // El formulario espera los borradores de la copia local, que en el emulador van detrás de la primera sincronización.
    await expect(page.getByLabel('DM', { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.getByLabel('DM', { exact: true }).selectOption(w.dm.id);
    await button(page, 'Siguiente').dispatchEvent('click');
    await page.getByLabel('Transportista', { exact: true }).selectOption(w.carrier.id);
    await page.getByLabel('Camión', { exact: true }).selectOption(w.truck.id);
    await page.getByLabel('Chofer', { exact: true }).selectOption(w.driver.id);
    await button(page, 'Siguiente').dispatchEvent('click');
    await page.getByLabel('Toneladas', { exact: true }).fill('17,28');
    await page.getByLabel('Carta de porte', { exact: true }).fill('22352');
    await button(page, 'Siguiente').dispatchEvent('click');
    await expect(page.locator('article[aria-label="Documento de la orden por emitir"]')).toContainText('17.280');
    await button(page, 'Emitir').dispatchEvent('click');
    const number = `EAGLEAND-${havanaToday().slice(0, 4)}-V1-0001`;
    // La primera emisión arranca el Chromium del servidor para el PDF: con el equipo cargado tarda.
    await expect(page.getByText(number, { exact: true })).toBeVisible({ timeout: 90_000 });
    expect(await sql('SELECT status FROM load_orders WHERE number = $1', [number])).toEqual([{ status: 'official' }]);
    // La orden llega a la copia local por la sincronización (es lo que se verá luego sin conexión).
    await page.evaluate(() => (location.hash = '#/ordenes'));
    await expect(page.getByText(number).first()).toBeVisible({ timeout: 90_000 });

    // RF-ALR-01: con la app cerrada, la alerta llega por el servicio en primer plano, cuando ya está conectado (una
    // alerta creada mientras no lo está no se notifica después: se ve en el contador al abrir la app).
    const connected = () =>
      expect
        .poll(async () => (await notifications(device)).includes('Impocaribe conectado'), { timeout: 60_000 })
        .toBe(true);
    await connected();
    await closeApp(device);
    await connected();
    const reference = `DM 80434 prueba ${Date.now()}`;
    await sql(
      `INSERT INTO alerts (type, kind, audience_roles, title, detail, created_at)
       VALUES ('AL-01', 'event', '{apoderada,operador,lectura}', $1, 'Prueba de T122', now())`,
      [reference],
    );
    await expect.poll(async () => (await notifications(device)).includes(reference), { timeout: 30_000 }).toBe(true);

    // RF-CON-01 y 05: sin red, la app abre con la copia local y la banda de sin conexión.
    await sh(device, 'svc wifi disable');
    await sh(device, 'svc data disable');
    page = await launch(device, page);
    await expect(page.getByText(/Sin conexión · datos al/)).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => (location.hash = '#/ordenes'));
    await expect(page.getByText(number).first()).toBeVisible();
  } catch (err) {
    // Lo que se veía en el emulador (la traza del WebView no guarda la pantalla).
    await test.info().attach('emulador', { body: await device.screenshot(), contentType: 'image/png' });
    throw err;
  } finally {
    await sh(device, 'svc wifi enable');
    await sh(device, 'svc data enable');
    await device.close();
  }
});
