// T112 · P-24 Respaldos y restauración contra el servidor real, con pg_dump real y el efecto en la base. La contraseña de
// respaldo es una sola para el sistema, así que lo hace la PC: la define, hace un respaldo a mano y empieza a restaurarlo
// con una contraseña equivocada, que no cambia nada. La restauración completa cierra todas las sesiones (también las de
// las otras pruebas que corren a la vez): la cubren las pruebas de integración del servidor (restore.int.test.ts).
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';

const PASSWORD = 'respaldo de prueba 2026';

test('P-24: definir la contraseña, respaldar a mano y una restauración rechazada', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  test.skip(device !== 'desktop', 'La contraseña de respaldo es una para todo el sistema: la prueba la hace la PC.');
  test.setTimeout(420_000);
  const { apoderada } = readState();
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate(() => (location.hash = '#/respaldos'));

  // Sin contraseña no se respalda: es lo primero que se pide.
  await expect(page.getByRole('heading', { name: 'Defina la contraseña de respaldo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hacer un respaldo ahora' })).toBeDisabled();
  await page.getByLabel('Contraseña de respaldo', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confírmela').fill(PASSWORD);
  await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
  await expect(page.getByRole('group', { name: 'Contraseña de respaldo', exact: true })).toBeVisible();
  const [key] = await sql<{ n: string }>(
    `SELECT count(*)::text AS n FROM system_settings WHERE backup_public_key IS NOT NULL`,
  );
  expect(key!.n).toBe('1');

  // A mano: queda en la lista y en la base, con su archivo. pg_dump corre con prioridad baja (RNF-14): puede tardar.
  await page.getByRole('button', { name: 'Hacer un respaldo ahora' }).click();
  await expect(page.getByText('Se hizo el respaldo.')).toBeVisible({ timeout: 180_000 });
  const row = page.getByRole('row', { name: /^Manual/ });
  await expect(row).toContainText('Bien');
  const [made] = await sql<{ status: string; size: string }>(
    `SELECT status, size_bytes::text AS size FROM backups WHERE kind = 'manual' ORDER BY started_at DESC LIMIT 1`,
  );
  expect(made!.status).toBe('ok');
  expect(Number(made!.size)).toBeGreaterThan(0);

  // Restaurar con otra contraseña: lo dice, vuelve a pedirla y no se restaura nada.
  await row.getByRole('button', { name: /^Restaurar el respaldo del/ }).click();
  const dialog = page.getByRole('dialog', { name: /^Restaurar el respaldo del .* \(manual\)$/ });
  await dialog.getByLabel('Contraseña de respaldo', { exact: true }).fill('otra contraseña cualquiera');
  await dialog.getByRole('button', { name: 'Seguir' }).click();
  await expect(dialog.getByText('Se cierran todas las sesiones, también la suya.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Restaurar' })).toBeDisabled();
  await dialog.getByLabel('Escriba RESTAURAR para confirmar').fill('RESTAURAR');
  await dialog.getByRole('button', { name: 'Restaurar' }).click();
  await expect(dialog.getByText('La contraseña de respaldo no es correcta.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  const [restores] = await sql<{ n: string }>(`SELECT count(*)::text AS n FROM restores`);
  expect(restores!.n).toBe('0');
});
