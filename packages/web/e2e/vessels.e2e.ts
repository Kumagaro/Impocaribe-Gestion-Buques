// T071 y T072 · P-07 a P-11 contra el servidor real, con el efecto en la base. Las tres clases corren a la vez sobre la
// misma base, así que cada una usa sus propios buques y DM: la PC hace HU-04 completa (asignación parcial con motivo y
// el resto a otro buque); la tablet cierra un buque con los tres destinos (Apoderada); el teléfono, como Operador, no
// ve la merma.
import { clientsApi } from '../src/api/endpoints/catalogs';
import { declarationsApi, vesselsApi } from '../src/api/endpoints/vessels';
import { fillLogin, pairApp, readState } from './support/access';
import { signedInDevice } from './support/api';
import { expect, test } from './support/fixtures';

const REASON = 'El cliente acepta completar con el próximo buque';
const vesselBody = (name: string, totalTons: string) => ({
  name,
  manifest: '0080/2026',
  bl: 'BL-E2E',
  port: 'Mariel, terminal 2',
  internalBuyer: 'IMPOCARIBE S.A.',
  etaDate: null,
  arrivalDate: '2026-08-30',
  totalTons,
});

async function prepare(suffix: string) {
  const { apoderada } = readState();
  const api = await signedInDevice(apoderada.username, apoderada.password);
  const client = await api.request(clientsApi.create, {
    body: {
      name: `Nuevos Tiempos ${suffix}`,
      recipients: [{ name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' }],
    },
  });
  return { api, client };
}

test('P-07 a P-11: HU-04, cierre con los tres destinos y merma solo para la Apoderada', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const state = readState();
  await openApp('/');

  if (device === 'desktop') {
    const { api, client } = await prepare('PC');
    await api.request(vesselsApi.create, { body: vesselBody('Eagle PC', '50000') });
    const other = await api.request(vesselsApi.create, { body: vesselBody('Ocean PC', '40000') });
    await pairApp(page, device);
    await fillLogin(page, state.apoderada.username, state.apoderada.password);
    await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
    await page.evaluate(() => (location.hash = '#/dm'));

    // P-11 con la asignación inicial que supera lo libre (HU-04).
    await page.getByRole('button', { name: 'Nueva DM' }).click();
    const side = page.getByRole('complementary');
    await side.getByLabel('Número de DM').fill('70431');
    await side.getByLabel('Cliente').selectOption(client.id);
    await side.getByLabel('Marca').fill('Dosel');
    await side.getByLabel('Total (t)').fill('80000');
    await side.getByLabel('Buque').selectOption({ label: 'Eagle PC · V1 · libre 50 000,000 t' });
    await side.getByLabel('Toneladas').fill('80000');
    await side.getByRole('button', { name: 'Crear DM' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'La DM 70431 supera la cantidad restante del buque EAGLEPC en 30 000,000 t',
    });
    await dialog.getByLabel('Motivo').fill(REASON);
    await dialog.getByRole('button', { name: 'Sí, asignar 50 000,000 t' }).click();
    await expect(page.getByText('Se creó la DM 70431.')).toBeVisible();
    expect(
      await sql(
        `SELECT a.allocated_tons, c.kind, c.reason FROM allocations a
           JOIN customs_declarations d ON d.id = a.declaration_id
           JOIN allocation_changes c ON c.allocation_id = a.id WHERE d.number = '70431'`,
      ),
    ).toEqual([{ allocated_tons: '50000.000', kind: 'partial_assign', reason: REASON }]);

    // El resto, a otro buque, desde la ficha.
    await expect(side.getByText('Pendiente de asignar')).toBeVisible();
    await side.getByRole('button', { name: 'Asignar a un buque' }).click();
    await side.getByLabel('Buque').selectOption(other.id);
    await side.getByLabel('Toneladas').fill('30000');
    await side.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(page.getByText('Se asignó la DM 70431 al buque Ocean PC.')).toBeVisible();
    expect(
      await sql(
        `SELECT sum(a.allocated_tons)::text AS total FROM allocations a
           JOIN customs_declarations d ON d.id = a.declaration_id WHERE d.number = '70431'`,
      ),
    ).toEqual([{ total: '80000.000' }]);
    return;
  }

  if (device === 'tablet') {
    const { api, client } = await prepare('TAB');
    const closing = await api.request(vesselsApi.create, { body: vesselBody('Sea Star TAB', '100') });
    const target = await api.request(vesselsApi.create, { body: vesselBody('Ocean TAB', '50') });
    const d = await api.request(declarationsApi.create, {
      body: { number: '70432', clientId: client.id, brand: 'Dosel', totalTons: '200.000' },
    });
    await pairApp(page, device);
    await fillLogin(page, state.apoderada.username, state.apoderada.password);
    await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
    await page.evaluate((id) => (location.hash = `#/buques/${id}`), closing.id);

    await expect(page.getByRole('button', { name: 'Cerrar el buque' })).toBeDisabled();
    const give = async (kind: string, tons: string, pick?: [string, string]) => {
      await page.getByRole('tab', { name: 'Sobrante' }).click();
      await page.getByRole('button', { name: 'Registrar un destino' }).click();
      await page.getByLabel('Tipo de destino').selectOption({ label: kind });
      if (pick) await page.getByLabel(pick[0], { exact: true }).selectOption(pick[1]);
      await page.getByLabel('Toneladas').fill(tons);
      await page.getByLabel('Motivo').fill('Destino acordado al terminar la extracción');
      await page.getByRole('button', { name: 'Registrar el destino' }).click();
      await expect(page.getByText(`Se registró el destino: ${kind.toLowerCase()}.`)).toBeVisible();
    };
    await give('Asignar a una DM', '60', ['DM', d.id]);
    await give('Transferir a otro buque', '39', ['Buque destino', target.id]);
    await give('Merma o pérdida', '1');
    await page.getByRole('tab', { name: 'Resumen' }).click();
    await page.getByRole('button', { name: 'Cerrar el buque' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar el buque' }).click();
    await expect(page.getByText('El buque Sea Star TAB quedó cerrado.')).toBeVisible();
    expect(
      await sql('SELECT status, total_tons FROM vessels WHERE id IN ($1, $2) ORDER BY name', [target.id, closing.id]),
    ).toEqual([
      { status: 'open', total_tons: '89.000' },
      { status: 'closed', total_tons: '100.000' },
    ]);
    return;
  }

  // TEL: un Operador no ve la merma.
  const { api } = await prepare('TEL');
  const v = await api.request(vesselsApi.create, { body: vesselBody('Eagle TEL', '100') });
  const operador = state.users.operador[device];
  await pairApp(page, device);
  await fillLogin(page, operador.username, operador.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate((id) => (location.hash = `#/buques/${id}`), v.id);
  const sheet = page.getByRole('dialog', { name: 'Eagle TEL · V1' });
  await sheet.getByRole('tab', { name: 'Sobrante' }).click();
  await sheet.getByRole('button', { name: 'Registrar un destino' }).click();
  const kinds = await sheet.getByLabel('Tipo de destino').locator('option').allTextContents();
  expect(kinds).not.toContain('Merma o pérdida');
  expect(kinds).toContain('Transferir a otro buque');
});
