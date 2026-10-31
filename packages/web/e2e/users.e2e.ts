// T040 · Aceptación de P-21 (ui-spec) contra el servidor real, en las tres clases: cambiar el rol de un usuario cierra
// su sesión en su dispositivo; el cambio queda en la base y en la bitácora.
import { ApiError } from '../src/api/client';
import { getMe } from '../src/api/endpoints/auth';
import { postUser } from '../src/api/endpoints/users';
import { fillLogin, pairApp, readState } from './support/access';
import { signedInDevice } from './support/api';
import { expect, test } from './support/fixtures';

test('P-21: cambiar el rol de un usuario cierra su sesión en su dispositivo', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const { apoderada, users } = readState();
  const target = users.rol[device];
  // El usuario afectado tiene una sesión abierta en otro dispositivo.
  const theirs = await signedInDevice(target.username, target.password);
  expect((await theirs.request(getMe)).user.role).toBe('operador');

  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate(() => (location.hash = '#/usuarios'));

  const name = `Prueba rol ${device}`;
  if (device === 'desktop') await page.getByRole('cell', { name, exact: true }).click();
  else await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByLabel('Rol', { exact: true }).selectOption('lectura');
  await expect(page.getByText('Se cerrarán sus sesiones')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(`Se guardaron los cambios de ${name}.`)).toBeVisible();

  // Su sesión ya no vale; en la base tiene el rol nuevo, sin sesiones abiertas, y la bitácora registra la edición.
  const err = await theirs.request(getMe).catch((e: unknown) => e);
  expect([err instanceof ApiError, (err as ApiError).code]).toEqual([true, 'SESSION_EXPIRED']);
  expect(
    await sql<{ role: string; open: number }>(
      `SELECT u.role, (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS open
       FROM users u WHERE u.username = $1`,
      [target.username],
    ),
  ).toEqual([{ role: 'lectura', open: 0 }]);
  expect(
    await sql(
      `SELECT a.ok FROM audit_log a JOIN users u ON u.id::text = a.entity_id
       WHERE u.username = $1 AND a.action = 'user.edit'`,
      [target.username],
    ),
  ).toEqual([{ ok: true }]);
});

test('P-21: desactivar a un usuario cierra sus sesiones y ya no puede entrar (HU-11)', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const { apoderada } = readState();
  const n = { phone: 1, tablet: 2, desktop: 3 }[device];
  const target = { username: `baja.${device}`, password: `clave-baja-${device}-1`, fullName: `Prueba baja ${device}` };
  const admin = await signedInDevice(apoderada.username, apoderada.password);
  await admin.request(postUser, {
    body: {
      fullName: target.fullName,
      username: target.username,
      nationalId: `9001011234${n}`,
      phone: `5390001${n}`,
      role: 'operador',
      password: target.password,
      confirm: target.password,
    },
  });
  const theirs = await signedInDevice(target.username, target.password);

  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate(() => (location.hash = '#/usuarios'));
  if (device === 'desktop') await page.getByRole('cell', { name: target.fullName, exact: true }).click();
  else await page.getByRole('button', { name: new RegExp(target.fullName) }).click();
  await page.getByRole('button', { name: 'Desactivar' }).click();
  const dialog = page.getByRole('dialog', { name: `Desactivar a ${target.fullName}` });
  await dialog.getByRole('button', { name: 'Desactivar' }).click();
  await expect(dialog).toHaveCount(0);

  await expect
    .poll(() =>
      sql<{ active: boolean; open: number }>(
        `SELECT u.active, (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS open
         FROM users u WHERE u.username = $1`,
        [target.username],
      ),
    )
    .toEqual([{ active: false, open: 0 }]);
  const err = await theirs.request(getMe).catch((e: unknown) => e);
  expect([err instanceof ApiError, (err as ApiError).code]).toEqual([true, 'SESSION_EXPIRED']);
});
