// T038 · Aceptación de P-01, P-03 y P-04 (ui-spec) contra el servidor real, en las tres clases. Cada clase usa su
// propio usuario (setup.e2e.ts); las pruebas van en orden porque la recuperación y el bloqueo cambian su estado.
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'serial' });

// Recuperar hace siempre las 8 comprobaciones argon2id de 64 MB (T030), acierte o no: no se distingue qué dato falló.
const RECOVERY = { timeout: 60_000 };

test('P-01 y P-03: encuentra el servidor sin escribir nada, se empareja y entra al tablero', async ({
  openApp,
  page,
  device,
}) => {
  const user = readState().users[device];
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, user.username, user.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
});

test('P-04: con un código válido cambia la contraseña y entra con la nueva', async ({ openApp, page, device }) => {
  const user = readState().users[device];
  await openApp('/');
  await pairApp(page, device);
  await page.getByRole('link', { name: '¿Olvidó la contraseña?' }).click();
  await page.getByLabel('Usuario').fill(user.username);
  await page.getByLabel('Carné').fill(user.nationalId);
  await page.getByLabel('Teléfono').fill(user.phone);
  await page.getByLabel('Código de recuperación').fill(user.recoveryCodes[0]!);
  await page.getByLabel('Nueva contraseña').fill(`${user.password}-nueva`);
  await page.getByLabel('Confirmar').fill(`${user.password}-nueva`);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Contraseña cambiada' })).toBeVisible(RECOVERY);
  await page.getByRole('link', { name: 'Ir a iniciar sesión' }).click();
  await fillLogin(page, user.username, `${user.password}-nueva`);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
});

test('P-04: un código ya usado no sirve, y el error no dice qué dato falló', async ({ openApp, page, device }) => {
  const user = readState().users[device];
  await openApp('/');
  await pairApp(page, device);
  await page.getByRole('link', { name: '¿Olvidó la contraseña?' }).click();
  await page.getByLabel('Usuario').fill(user.username);
  await page.getByLabel('Carné').fill(user.nationalId);
  await page.getByLabel('Teléfono').fill(user.phone);
  await page.getByLabel('Código de recuperación').fill(user.recoveryCodes[0]!);
  await page.getByLabel('Nueva contraseña').fill('otra-clave-1');
  await page.getByLabel('Confirmar').fill('otra-clave-1');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('alert')).toHaveText('Los datos no coinciden. Revíselos e inténtelo de nuevo.', RECOVERY);
});

test('P-03: tras 3 fallos avisa de los intentos; tras 5, explica cuánto falta y no deja intentar', async ({
  openApp,
  page,
  device,
}) => {
  const user = readState().users[device];
  await openApp('/');
  await pairApp(page, device);
  for (let i = 1; i <= 3; i++) await fillLogin(page, user.username, `mala-${i}`);
  await expect(page.getByText('Le quedan 2 intentos antes del bloqueo de 15 minutos')).toBeVisible();
  for (let i = 4; i <= 5; i++) await fillLogin(page, user.username, `mala-${i}`);
  await expect(page.getByRole('alert')).toContainText('Podrá intentarlo de nuevo en 15 minutos.');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();
});
