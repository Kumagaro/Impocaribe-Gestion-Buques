// T038 · P-02 (ui-spec): "crea la Apoderada en el servidor real y entra". Corre una vez, en la PC servidor, antes que
// las demás pruebas (proyecto primer-arranque), y deja un usuario por clase de dispositivo con sus códigos.
import { writeFileSync } from 'node:fs';
import { postUser } from '../src/api/endpoints/users';
import type { E2EState } from './support/access';
import { pairApp } from './support/access';
import { signedInDevice } from './support/api';
import { E2E_STATE_FILE } from './support/env';
import { expect, test } from './support/fixtures';

const APODERADA = { username: 'ilen.fernandez', password: 'apoderada-e2e-1' };
const DEVICE_USERS = [
  { device: 'phone', nationalId: '85010112345', phone: '52345671' },
  { device: 'tablet', nationalId: '86020212345', phone: '52345672' },
  { device: 'desktop', nationalId: '87030312345', phone: '52345673' },
] as const;

test('P-02: en la PC servidor crea la primera Apoderada, muestra sus códigos y entra', async ({ openApp, page }) => {
  await openApp('/');
  await pairApp(page, 'desktop');

  // El login ve que no hay Apoderada y, en la PC servidor, lleva al primer arranque.
  await expect(page.getByRole('heading', { name: 'Datos de la primera Apoderada' })).toBeVisible();
  await page.getByLabel('Nombre y apellidos').fill('Ilén Fernández Ruiz');
  await page.getByLabel('Usuario').fill(APODERADA.username);
  await page.getByLabel('Carné de identidad').fill('84011905548');
  await page.getByLabel('Teléfono').fill('52345678');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Contraseña', { exact: true }).fill(APODERADA.password);
  await page.getByLabel('Confirmar').fill(APODERADA.password);
  await page.getByRole('button', { name: 'Crear Apoderada' }).click();

  const codes = page.getByRole('list', { name: 'Códigos de recuperación' }).getByRole('listitem');
  await expect(codes).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Terminar y entrar' })).toBeDisabled();
  await page.getByLabel('Los copié a mano').check();
  await page.getByRole('button', { name: 'Terminar y entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();

  // Un usuario por clase, para que las pruebas de cada una no se pisen (bloqueos, recuperación).
  const api = await signedInDevice(APODERADA.username, APODERADA.password);
  const users = {} as E2EState['users'];
  for (const u of DEVICE_USERS) {
    const password = `clave-${u.device}-1`;
    const username = `e2e.${u.device}`;
    const res = await api.request(postUser, {
      body: {
        fullName: `Prueba ${u.device}`,
        username,
        nationalId: u.nationalId,
        phone: u.phone,
        role: 'operador',
        password,
        confirm: password,
      },
    });
    users[u.device] = {
      username,
      password,
      nationalId: u.nationalId,
      phone: u.phone,
      recoveryCodes: res.recoveryCodes,
    };
  }
  writeFileSync(E2E_STATE_FILE, JSON.stringify({ apoderada: APODERADA, users } satisfies E2EState));
});
