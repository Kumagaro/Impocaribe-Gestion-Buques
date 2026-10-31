// T054 · P-22 Empresa y P-23 Configuración contra el servidor real, con el efecto en la base y la bitácora. Las tres
// clases corren a la vez sobre la única fila de configuración, así que cada una hace su parte: la PC cambia los datos de
// la empresa y la configuración; la tablet carga la firma; el teléfono, el cuño (que no cambian la versión de la fila).
// La aceptación que usa órdenes ("la siguiente orden usa la firma nueva", "Nueva orden rechaza el día 4") llega con las
// órdenes (F4 y siguientes).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jpeg, png } from '../../shared/src/testing/images.ts';
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test, type Sql } from './support/fixtures';

async function signIn(page: Parameters<typeof pairApp>[0], device: 'phone' | 'tablet' | 'desktop', path: string) {
  const { apoderada } = readState();
  await pairApp(page, device);
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate((p) => (location.hash = p), `#${path}`);
}

const lastAudit = async (sql: Sql, action: string) =>
  (
    await sql<{ ok: boolean; before: unknown; after: unknown }>(
      'SELECT ok, before, after FROM audit_log WHERE action = $1 ORDER BY id DESC LIMIT 1',
      [action],
    )
  )[0];

test('P-22 y P-23: cada cambio queda guardado y en la bitácora', async ({ openApp, page, device, sql }) => {
  await openApp('/');

  if (device === 'desktop') {
    // P-22: datos de la empresa.
    await signIn(page, device, '/empresa');
    await page.getByLabel('Razón social').fill('IMPOCARIBE S.A.');
    await page.getByLabel('Dirección').fill('Calle 23 No. 456, Vedado, La Habana');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Se guardaron los datos de la empresa.')).toBeVisible();
    expect(await sql('SELECT legal_name, address FROM system_settings')).toEqual([
      { legal_name: 'IMPOCARIBE S.A.', address: 'Calle 23 No. 456, Vedado, La Habana' },
    ]);

    // P-23: días máximos a 3, con una carpeta que la PC servidor (este mismo equipo) puede escribir.
    const usb = mkdtempSync(join(tmpdir(), 'impocaribe-e2e-usb-'));
    await page.evaluate(() => (location.hash = '#/configuracion'));
    const days = page.getByLabel('Días máximos hacia el futuro para la fecha de carga');
    await days.fill('3');
    await page.getByRole('radio', { name: 'Hotspot de un celular' }).click();
    // Una carpeta que no existe la rechaza la PC servidor, con el motivo en el campo; no se guarda nada.
    await page.getByLabel('Carpeta externa del respaldo diario').fill(join(usb, 'no-existe'));
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByText('La carpeta no existe en la PC servidor. Conecte la memoria USB o elija otra.').first(),
    ).toBeVisible();
    expect(await sql('SELECT max_loading_days_ahead FROM system_settings')).toEqual([{ max_loading_days_ahead: 7 }]);

    await page.getByLabel('Carpeta externa del respaldo diario').fill(usb);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Se guardaron los cambios de la configuración.')).toBeVisible();
    expect(await sql('SELECT max_loading_days_ahead, external_backup_dir, network_setup FROM system_settings')).toEqual(
      [{ max_loading_days_ahead: 3, external_backup_dir: usb, network_setup: 'hotspot' }],
    );
    expect(await lastAudit(sql, 'settings.edit')).toMatchObject({
      ok: true,
      before: { maxLoadingDaysAhead: 7, externalBackupDir: null, networkSetup: 'router' },
      after: { maxLoadingDaysAhead: 3, externalBackupDir: usb, networkSetup: 'hotspot' },
    });
    // Al volver a abrir la pantalla, lo guardado.
    await page.reload();
    await expect(days).toHaveValue('3');
    return;
  }

  await signIn(page, device, '/empresa');
  if (device === 'tablet') {
    // P-22: cargar la firma oficial con los datos del representante.
    await page.getByRole('button', { name: /^(Cargar la firma|Reemplazar firma)$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Imagen de la firma').setInputFiles({
      name: 'firma.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg(640, 220)),
    });
    await expect(dialog.getByText('Se recomienda fondo transparente')).toBeVisible();
    await dialog.getByLabel('Representante').fill('Ilén Fernández Rojas');
    await dialog.getByLabel('No. de credencial').fill('00123');
    await dialog.getByLabel('Cargo').fill('Directora');
    await dialog.getByRole('button', { name: 'Guardar la firma' }).click();
    await expect(page.getByText('Se guardó la firma oficial. Las órdenes nuevas la usarán.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Firma oficial' }).getByText('Cargada')).toBeVisible();
    const [sig] = await sql<{ name: string; mime: string }>(
      `SELECT s.representative_name AS name, f.mime FROM system_settings c
       JOIN official_signatures s ON s.id = c.current_signature_id JOIN files f ON f.id = s.file_id`,
    );
    expect(sig).toEqual({ name: 'Ilén Fernández Rojas', mime: 'image/jpeg' });
    expect(await lastAudit(sql, 'company.signature.replace')).toMatchObject({
      ok: true,
      after: { representativeName: 'Ilén Fernández Rojas', credentialNo: '00123', position: 'Directora' },
    });
    return;
  }

  // phone · P-22: cargar el cuño oficial.
  await page.getByRole('button', { name: /^(Cargar el cuño|Reemplazar cuño)$/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet
    .getByLabel('Imagen del cuño')
    .setInputFiles({ name: 'cuno.png', mimeType: 'image/png', buffer: Buffer.from(png(400, 400)) });
  await sheet.getByRole('button', { name: 'Guardar el cuño' }).click();
  await expect(page.getByText('Se guardó el cuño oficial. Las órdenes nuevas lo usarán.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cuño oficial' }).getByText('Cargado')).toBeVisible();
  expect(
    await sql(
      'SELECT f.mime FROM system_settings c JOIN official_stamps s ON s.id = c.current_stamp_id JOIN files f ON f.id = s.file_id',
    ),
  ).toEqual([{ mime: 'image/png' }]);
});
