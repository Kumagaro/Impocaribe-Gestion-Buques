// T038 · Aceptación de P-01, P-03 y P-04 (ui-spec) contra el servidor real, en las tres clases, con el efecto
// comprobado en la base y en la bitácora. Cada clase usa su propio usuario (setup.e2e.ts); las pruebas van en orden
// porque la recuperación y el bloqueo cambian su estado.
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test, type Sql } from './support/fixtures';

test.describe.configure({ mode: 'serial' });

// Recuperar hace siempre las 8 comprobaciones argon2id de 64 MB (T030), acierte o no: no se distingue qué dato falló.
const RECOVERY = { timeout: 60_000 };

/** El resultado (ok) de cada entrada de la bitácora de ese usuario con esa acción, en orden. */
async function audit(sql: Sql, username: string, action: string): Promise<boolean[]> {
  const rows = await sql<{ ok: boolean }>(
    'SELECT a.ok FROM audit_log a JOIN users u ON u.id = a.user_id WHERE u.username = $1 AND a.action = $2 ORDER BY a.id',
    [username, action],
  );
  return rows.map((r) => r.ok);
}

test('P-01 y P-03: encuentra el servidor sin escribir nada, se empareja y entra al tablero', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const user = readState().users.acceso[device];
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, user.username, user.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();

  // La sesión abierta es de un dispositivo emparejado por código (TEL y TAB) o por la interfaz local (PC servidor).
  const sessions = await sql<{ paired_method: string; platform: string }>(
    `SELECT d.paired_method, s.platform FROM sessions s
     JOIN users u ON u.id = s.user_id JOIN devices d ON d.id = s.device_id
     WHERE u.username = $1 AND s.kind = 'app' AND s.revoked_at IS NULL`,
    [user.username],
  );
  expect(sessions).toEqual([
    device === 'desktop'
      ? { paired_method: 'local', platform: 'windows' }
      : { paired_method: 'code', platform: 'android' },
  ]);
  expect(await audit(sql, user.username, 'auth.login')).toEqual([true]);
});

test('P-04: con un código válido cambia la contraseña y entra con la nueva', async ({ openApp, page, device, sql }) => {
  const user = readState().users.acceso[device];
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

  // Ese código quedó usado y los otros 7 siguen sirviendo; la bitácora registra la recuperación.
  const codes = await sql<{ used: boolean }>(
    `SELECT rc.used_at IS NOT NULL AS used FROM recovery_codes rc JOIN users u ON u.id = rc.user_id
     WHERE u.username = $1 AND rc.invalidated_at IS NULL`,
    [user.username],
  );
  expect([codes.length, codes.filter((c) => c.used).length]).toEqual([8, 1]);
  expect(await audit(sql, user.username, 'auth.recover')).toEqual([true]);
});

test('P-04: un código ya usado no sirve, y el error no dice qué dato falló', async ({ openApp, page, device, sql }) => {
  const user = readState().users.acceso[device];
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
  expect(await audit(sql, user.username, 'auth.recover')).toEqual([true, false]);
});

test('P-03: tras 3 fallos avisa de los intentos; tras 5, explica cuánto falta y no deja intentar', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const user = readState().users.acceso[device];
  await openApp('/');
  await pairApp(page, device);
  for (let i = 1; i <= 3; i++) await fillLogin(page, user.username, `mala-${i}`);
  await expect(page.getByText('Le quedan 2 intentos antes del bloqueo de 15 minutos')).toBeVisible();
  for (let i = 4; i <= 5; i++) await fillLogin(page, user.username, `mala-${i}`);
  await expect(page.getByRole('alert')).toContainText('Podrá intentarlo de nuevo en 15 minutos.');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();

  // Bloqueada 15 minutos desde el 5.º fallo, y la bitácora registra el bloqueo.
  const [row] = await sql<{ minutes: number }>(
    'SELECT round(extract(epoch FROM locked_until - now()) / 60)::int AS minutes FROM users WHERE username = $1',
    [user.username],
  );
  expect(row!.minutes).toBeGreaterThanOrEqual(14);
  expect(row!.minutes).toBeLessThanOrEqual(15);
  expect(await audit(sql, user.username, 'auth.locked')).toEqual([true]);
});
