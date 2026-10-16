// T039 · Aceptación de P-05 (ui-spec) contra el servidor real, en las tres clases: cerrar otra sesión desde el perfil
// la invalida en el servidor, y "Reducir animaciones" quita los desplazamientos en toda la app.
import { ApiError } from '../src/api/client';
import { getMe } from '../src/api/endpoints/auth';
import { fillLogin, pairApp, readState } from './support/access';
import { signedInDevice } from './support/api';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'serial' });

test('P-05: cerrar otra sesión desde el perfil la invalida en el servidor', async ({ openApp, page, device, sql }) => {
  const user = readState().users.perfil[device];
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, user.username, user.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();

  // Otra sesión del mismo usuario, en otro dispositivo (la PC servidor de la prueba).
  const other = await signedInDevice(user.username, user.password);
  expect((await other.request(getMe)).user.username).toBe(user.username);

  await page.evaluate(() => (location.hash = '#/perfil/sesiones'));
  const row = page
    .getByRole('list', { name: 'Sesiones abiertas' })
    .getByRole('listitem')
    .filter({ hasText: 'Pruebas E2E' });
  await row.getByRole('button', { name: 'Cerrar' }).click();
  await expect(row).toHaveCount(0);

  // El servidor ya no la acepta y la base la marca como cerrada; la sesión de la app sigue abierta.
  const err = await other.request(getMe).catch((e: unknown) => e);
  expect([err instanceof ApiError, (err as ApiError).code]).toEqual([true, 'SESSION_EXPIRED']);
  const rows = await sql<{ label: string; open: boolean }>(
    `SELECT s.device_label AS label, s.revoked_at IS NULL AS open FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE u.username = $1 AND s.kind = 'app' ORDER BY s.created_at`,
    [user.username],
  );
  expect(rows.map((r) => [r.label === 'Pruebas E2E', r.open])).toEqual([
    [false, true],
    [true, false],
  ]);
  expect(await sql("SELECT ok FROM audit_log WHERE action = 'auth.session_closed'")).toContainEqual({ ok: true });
});

test('P-05: "Reducir animaciones" quita los desplazamientos en toda la app y se recuerda en el dispositivo', async ({
  openApp,
  page,
  device,
}) => {
  const user = readState().users.perfil[device];
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, user.username, user.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  // Con movimiento, los botones se encogen al pulsarlos (MOV-01); reducido, solo cambian de color.
  await expect(page.locator('[data-press="scale"]').first()).toBeAttached();

  await page.evaluate(() => (location.hash = '#/perfil/apariencia'));
  await page.getByRole('switch', { name: 'Reducir animaciones (solo en este dispositivo)' }).click();
  await expect(page.locator('[data-press="scale"]')).toHaveCount(0);
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await expect(page.locator('[data-press="scale"]')).toHaveCount(0);

  // Recargar la app: la preferencia sigue en este dispositivo.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await expect(page.locator('[data-press="color"]').first()).toBeAttached();
  await expect(page.locator('[data-press="scale"]')).toHaveCount(0);
});
