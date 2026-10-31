// T138 · HU-06 contra el servidor real: sin conexión la app sigue abierta con «Sin conexión · datos al …» y guarda en
// el dispositivo lo que se escribe (RF-CON-05, RF-ORD-06); al volver la conexión, ese borrador sube solo como privado
// de su autor (RF-ORD-08). Que el saldo cambie en segundos por la orden de otro (HU-06, escenario 3) lo comprueba
// consultas.e2e.ts en el tablero.
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';
import { prepare } from './support/orders';

// La red simulada del navegador no siempre cierra el WebSocket: la app lo nota en el siguiente sondeo (POLL_MS, 60 s).
const NOTICE = { timeout: 75_000 };

const DATA = {
  phone: { code: 'SCT', dm: '83061', plate: 'P861', nationalId: '84011905561', license: '80000000061' },
  tablet: { code: 'SCB', dm: '83062', plate: 'P862', nationalId: '84011905562', license: '80000000062' },
  desktop: { code: 'SCE', dm: '83063', plate: 'P863', nationalId: '84011905563', license: '80000000063' },
} as const;

test('HU-06: sin conexión guarda el borrador en el dispositivo y al volver lo sube como privado', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  test.setTimeout(5 * 60_000);
  const w = await prepare(DATA[device]);
  const user = readState().users.operador[device];
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, user.username, user.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  // El formulario aparece con la copia local ya descargada: la primera descarga necesita conexión.
  await page.evaluate(() => (location.hash = '#/ordenes/nueva'));
  const dm = page.getByLabel('DM', { exact: true });
  await expect(dm).toBeVisible({ timeout: 90_000 });

  await page.context().setOffline(true);
  await expect(page.getByText(/Sin conexión · datos al/).first()).toBeVisible(NOTICE);
  await dm.selectOption(w.dm.id);
  await expect(page.getByText(/Sin conexión · datos al .* · 1 borrador por subir/).first()).toBeVisible();
  const mine = () =>
    sql<{ visibility: string }>(
      `SELECT d.visibility FROM drafts d JOIN users u ON u.id = d.owner_id
        WHERE u.username = $1 AND d.payload->>'declarationId' = $2`,
      [user.username, w.dm.id],
    );
  expect(await mine()).toEqual([]);

  await page.context().setOffline(false);
  await expect(page.getByText(/Sin conexión · datos al/)).toHaveCount(0, NOTICE);
  await expect.poll(mine, { timeout: 30_000 }).toEqual([{ visibility: 'private' }]);
});
