// T038 · P-02 (ui-spec): "crea la Apoderada en el servidor real y entra". Corre una vez, en la PC servidor, antes que
// las demás pruebas (proyecto primer-arranque), y deja un usuario por clase de dispositivo con sus códigos.
import type { Role } from '@impocaribe/shared';
import { writeFileSync } from 'node:fs';
import { postUser } from '../src/api/endpoints/users';
import type { E2EState } from './support/access';
import { pairApp } from './support/access';
import { signedInDevice } from './support/api';
import { E2E_STATE_FILE } from './support/env';
import { expect, test } from './support/fixtures';

const APODERADA = { username: 'ilen.fernandez', password: 'apoderada-e2e-1' };
const DEVICES = ['phone', 'tablet', 'desktop'] as const;
/** Cada archivo de pruebas tiene sus usuarios: corren a la vez y unos bloquean o cambian contraseñas. */
// rol: a quien P-21 le cambia el rol; operador y lectura: los roles de las guardas (T041).
const PURPOSES = {
  acceso: 'operador',
  perfil: 'operador',
  rol: 'operador',
  operador: 'operador',
  lectura: 'lectura',
} as const;

test('P-02: en la PC servidor crea la primera Apoderada, muestra sus códigos y entra', async ({
  openApp,
  page,
  sql,
}) => {
  // Prepara 15 usuarios por la API, cada uno con 9 comprobaciones argon2id de 64 MB (contraseña y 8 códigos).
  test.setTimeout(8 * 60_000);
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
  // Crear la Apoderada hace 9 argon2id de 64 MB (contraseña y 8 códigos): en un equipo modesto y ocupado pasa de 20 s.
  await expect(codes).toHaveCount(8, { timeout: 90_000 });
  await expect(page.getByRole('button', { name: 'Terminar y entrar' })).toBeDisabled();
  await page.getByLabel('Los copié a mano').check();
  await page.getByRole('button', { name: 'Terminar y entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();

  // En la base: una sola Apoderada, sin cambio de contraseña pendiente, con 8 códigos sin usar y su alta en la bitácora.
  expect(await sql('SELECT username, role, active, must_change_password FROM users ORDER BY created_at')).toEqual([
    { username: APODERADA.username, role: 'apoderada', active: true, must_change_password: false },
  ]);
  expect(
    await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM recovery_codes rc JOIN users u ON u.id = rc.user_id
       WHERE u.username = $1 AND rc.used_at IS NULL AND rc.invalidated_at IS NULL`,
      [APODERADA.username],
    ),
  ).toEqual([{ n: 8 }]);
  expect(await sql("SELECT ok FROM audit_log WHERE action = 'setup.first_apoderada'")).toEqual([{ ok: true }]);
  expect(await sql('SELECT paired_method FROM devices WHERE revoked_at IS NULL')).toEqual([{ paired_method: 'local' }]);

  // Un usuario por propósito y clase, para que las pruebas que corren a la vez no se pisen.
  const api = await signedInDevice(APODERADA.username, APODERADA.password);
  const users = { acceso: {}, perfil: {}, rol: {}, operador: {}, lectura: {} } as E2EState['users'];
  let n = 0;
  for (const [purpose, role] of Object.entries(PURPOSES) as [keyof typeof PURPOSES, Role][]) {
    for (const device of DEVICES) {
      const password = `clave-${device}-1`;
      const username = `${purpose}.${device}`;
      // Carné con fecha válida (85-01-01, 86-01-01…) y teléfono distintos para cada uno.
      const nationalId = `${85 + n}0101123${String(n).padStart(2, '0')}`;
      const phone = `523456${String(n).padStart(2, '0')}`;
      n++;
      const res = await api.request(postUser, {
        body: {
          fullName: `Prueba ${purpose} ${device}`,
          username,
          nationalId,
          phone,
          role,
          password,
          confirm: password,
        },
      });
      users[purpose][device] = { username, password, nationalId, phone, recoveryCodes: res.recoveryCodes };
    }
  }
  writeFileSync(E2E_STATE_FILE, JSON.stringify({ apoderada: APODERADA, users } satisfies E2EState));
});
