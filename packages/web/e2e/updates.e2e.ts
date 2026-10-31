// T114 · P-26 Versiones de la app contra el servidor real: publicar con el archivo en multipart, verlo en la lista y
// descargarlo con su huella, y marcar la mínima. Las versiones y la mínima son una sola para todo el sistema y las otras
// pruebas corren a la vez: lo hace la PC, con números que no dejan fuera a nadie (la app de las pruebas es la 0.0.0) y
// sin publicar una de Windows o Android más nueva (que mostraría AL-15 en las demás).
import { createHash } from 'node:crypto';
import { fillLogin, pairApp, readState } from './support/access';
import { SERVER_URL } from './support/env';
import { expect, test } from './support/fixtures';

/** Un APK mínimo: un ZIP vacío, que empieza por PK\x03\x04 como cualquier APK. */
const APK = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(2048, 7)]);
const EXE = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(2048, 9)]);

test('P-26: publicar el WebView, descargarlo y marcar la mínima de Windows', async ({ openApp, page, device, sql }) => {
  test.skip(device !== 'desktop', 'Las versiones son una sola para todo el sistema: la prueba la hace la PC.');
  const { apoderada } = readState();
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate(() => (location.hash = '#/versiones'));
  await expect(page.getByText('Esta PC: 0.0.0 · al día')).toBeVisible();

  // Publicar: la versión mal escrita se marca; con todo bien, sube el archivo.
  await page.getByRole('button', { name: 'Publicar una versión' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publicar una versión' });
  await dialog.getByLabel('Plataforma').selectOption('android-webview-system');
  await dialog.getByLabel('Versión').fill('119');
  await dialog
    .getByLabel('Archivo')
    .setInputFiles({ name: 'webview-119.apk', mimeType: 'application/octet-stream', buffer: APK });
  await dialog.getByRole('button', { name: 'Publicar' }).click();
  await expect(
    dialog.getByText('Escriba la versión con tres números separados por puntos, por ejemplo 1.4.2.'),
  ).toBeVisible();
  await dialog.getByLabel('Versión').fill('119.0.0');
  await dialog.getByLabel('Novedades').fill('WebView para Android 10 o superior');
  await dialog.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Se publicó la 119.0.0. Los dispositivos verán el aviso.')).toBeVisible();
  const row = page.getByRole('row', { name: 'Versión 119.0.0' });
  await expect(row).toContainText('WebView para Android 10 o superior');
  // El WebView no tiene versión mínima.
  await expect(row.getByRole('button')).toHaveCount(0);

  const sha = createHash('sha256').update(APK).digest('hex');
  expect(await sql(`SELECT platform, version, sha256 FROM app_releases`)).toEqual([
    { platform: 'android-webview-system', version: '119.0.0', sha256: sha },
  ]);
  // La descarga es pública (P-27 la usa antes de que la interfaz arranque) y trae su huella.
  const download = await fetch(`${SERVER_URL}/updates/android-webview-system/119.0.0/download`);
  expect(download.headers.get('x-content-sha256')).toBe(sha);
  expect(Buffer.from(await download.arrayBuffer()).equals(APK)).toBe(true);

  // Una de Windows igual a la de la app y marcarla como mínima: no deja fuera a nadie.
  await page.getByRole('button', { name: 'Publicar una versión' }).click();
  await dialog.getByLabel('Plataforma').selectOption('windows');
  await dialog.getByLabel('Versión').fill('0.0.0');
  await dialog
    .getByLabel('Archivo')
    .setInputFiles({ name: 'impocaribe-0.0.0.exe', mimeType: 'application/octet-stream', buffer: EXE });
  await dialog.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText('Se publicó la 0.0.0. Los dispositivos verán el aviso.')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar la 0.0.0 como mínima' }).click();
  const confirm = page.getByRole('dialog', { name: 'Marcar la 0.0.0 de Windows (instalador ligero) como mínima' });
  await expect(confirm.getByText('Ahora no hay ningún dispositivo con una versión anterior.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Marcar como mínima' }).click();
  await expect(page.getByText('La 0.0.0 es ahora la versión mínima.')).toBeVisible();
  await expect(page.getByRole('row', { name: 'Versión 0.0.0' })).toContainText('Mínima');
  expect(await sql(`SELECT action, ok FROM audit_log WHERE action LIKE 'release.%' ORDER BY id`)).toEqual([
    { action: 'release.publish', ok: true },
    { action: 'release.publish', ok: true },
    { action: 'release.min_supported', ok: true },
  ]);
});
