// T128 · Aceptación de P-29 (ui-spec) contra el servidor real: ante la PC servidor y sin sesión, cualquiera ve el
// estado y confirma o rechaza las solicitudes de emparejamiento (RF-RED-04, 05); revocar pide una Apoderada (RF-INS-11).
// Solo en escritorio: P-29 existe únicamente en la PC servidor (Const. art. XIV.1).
import { fillLogin, pairApp, readState } from './support/access';
import { SERVER_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(({ device }) => device !== 'desktop', 'P-29 solo existe en la PC servidor');

/** Un teléfono que pide emparejarse, como lo haría la app desde P-01. */
async function requestPairing(deviceName: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/pairing/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Version': '0.0.0', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ deviceName, platform: 'android', clientNonce: crypto.randomUUID() }),
  });
  if (!res.ok) throw new Error(`POST /pairing/requests: ${res.status} ${await res.text()}`);
}

test('P-29: sin sesión muestra el estado y confirma o rechaza las solicitudes de emparejamiento', async ({
  openApp,
  page,
  sql,
}) => {
  await openApp('/');
  await pairApp(page, 'desktop');
  await page.getByRole('link', { name: 'Estado del servidor y emparejamientos' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del servidor' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Servicio' })).toContainText('En marcha');
  await expect(page.getByRole('region', { name: 'Energía' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^QR para emparejar con / })).toBeVisible();

  const stamp = Date.now();
  const accepted = `Teléfono P-29 ${stamp}`;
  const refused = `Tablet P-29 ${stamp}`;
  await requestPairing(accepted);
  await requestPairing(refused);

  const requests = page.getByRole('region', { name: 'Solicitudes de emparejamiento' });
  const row = (name: string) => requests.getByRole('listitem').filter({ hasText: name });
  await expect(row(accepted)).toBeVisible();
  await row(accepted).getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(`«${accepted}» quedó emparejado.`)).toBeVisible();
  await row(refused).getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByText(`Se rechazó «${refused}».`)).toBeVisible();
  await expect(row(accepted)).toHaveCount(0);
  await expect(row(refused)).toHaveCount(0);

  // El confirmado ya es un dispositivo emparejado por código y aparece en la lista; el rechazado, no.
  await expect(page.getByRole('region', { name: 'Dispositivos' }).getByRole('cell', { name: accepted })).toBeVisible();
  expect(await sql('SELECT paired_method FROM devices WHERE name = $1', [accepted])).toEqual([
    { paired_method: 'code' },
  ]);
  expect(await sql('SELECT count(*)::int AS n FROM devices WHERE name = $1', [refused])).toEqual([{ n: 0 }]);
  // Sin sesión no se puede revocar.
  await expect(page.getByRole('button', { name: 'Revocar' })).toHaveCount(0);
});

test('P-29: la Apoderada con sesión revoca un dispositivo', async ({ openApp, page, sql }) => {
  const name = `Teléfono revocado ${Date.now()}`;
  await requestPairing(name);
  const [pending] = await sql<{ id: string }>(
    "SELECT id FROM pairing_requests WHERE device_name = $1 AND status = 'pending'",
    [name],
  );
  // El emparejamiento ya se probó desde la pantalla; aquí se confirma por la interfaz local.
  const res = await fetch(`${SERVER_URL}/local/pairing/${pending!.id}/confirm`, {
    method: 'POST',
    headers: { 'X-App-Version': '0.0.0', 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(res.ok).toBe(true);

  const { apoderada } = readState();
  await openApp('/');
  await pairApp(page, 'desktop');
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.getByRole('button', { name: /Estado del servidor/ }).click();

  const row = page.getByRole('region', { name: 'Dispositivos' }).getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Revocar' }).click();
  await expect(page.getByText(`Se revocó «${name}»: tendrá que volver a emparejarse.`)).toBeVisible();
  expect(
    await sql<{ revoked: boolean }>('SELECT revoked_at IS NOT NULL AS revoked FROM devices WHERE name = $1', [name]),
  ).toEqual([{ revoked: true }]);
});
