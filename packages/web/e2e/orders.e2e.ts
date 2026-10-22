// T086 a T089 · P-13 a P-16 contra el servidor y Chromium reales, con el efecto en la base. Las tres clases corren a la
// vez, cada una con su buque, su DM y su camión: la PC emite (con sobregiro, excepción de capacidad y camión repetido)
// y descarga el original; la tablet corrige y anula una orden emitida por otra persona y descarga una copia; el
// teléfono encuentra en edición un borrador que otra persona tiene abierto (EST-06).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { draftsApi, ordersApi } from '../src/api/endpoints/orders';
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test, type Sql } from './support/fixtures';
import { havanaToday, prepare } from './support/orders';

const REASON = 'Peso corregido en la báscula del puerto';

async function signIn(
  page: Parameters<typeof pairApp>[0],
  device: 'phone' | 'tablet' | 'desktop',
  who: { username: string; password: string },
  path: string,
) {
  await pairApp(page, device);
  await fillLogin(page, who.username, who.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate((p) => (location.hash = p), `#${path}`);
}

const loaded = async (sql: Sql, dm: string) =>
  (
    await sql<{ loaded: string }>(
      `SELECT b.loaded_tons::text AS loaded FROM v_declaration_balance b
         JOIN customs_declarations d ON d.id = b.declaration_id WHERE d.number = $1`,
      [dm],
    )
  )[0]!.loaded;

test('P-13 a P-16: emitir, corregir, anular, descargar y borradores', async ({ openApp, page, device, sql }) => {
  const state = readState();
  await openApp('/');

  if (device === 'desktop') {
    const w = await prepare({
      code: 'PC',
      dm: '80431',
      plate: 'P801',
      nationalId: '84011905501',
      license: '80000000001',
    });
    await signIn(page, device, state.apoderada, '/ordenes/nueva');
    const choose = async (tons: string) => {
      await page.getByLabel('DM', { exact: true }).selectOption(w.dm.id);
      await expect(page.getByLabel('Buque', { exact: true })).toHaveValue(w.dm.allocations[0]!.id);
      await page.getByLabel('Transportista', { exact: true }).selectOption(w.carrier.id);
      await page.getByLabel('Camión', { exact: true }).selectOption(w.truck.id);
      await page.getByLabel('Chofer', { exact: true }).selectOption(w.driver.id);
      await page.getByLabel('Toneladas', { exact: true }).fill(tons);
      await page.getByLabel('Carta de porte', { exact: true }).fill('22352');
    };

    // Emitir: número, saldo, PDF y bitácora (HU-01).
    await choose('17,28');
    await page.getByRole('button', { name: 'Emitir', exact: true }).click();
    const number = `EAGLEPC-${havanaToday().slice(0, 4)}-V1-0001`;
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    expect(await loaded(sql, '80431')).toBe('17.280');
    expect(await sql("SELECT ok FROM audit_log WHERE action = 'order.issue' AND ok")).not.toHaveLength(0);

    // RF-ORD-21: el original, con el mismo contenido que el archivado.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar el original' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${number}.pdf`);
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const [stored] = await sql<{ sha: string }>(
      'SELECT v.pdf_sha256 AS sha FROM load_order_versions v JOIN load_orders o ON o.id = v.order_id WHERE o.number = $1',
      [number],
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(stored!.sha);

    // Sobregiro: se ve al escribir, con el mensaje exacto, y no deja emitir.
    await page.getByRole('button', { name: 'Otra orden para esta DM' }).click();
    await choose('83');
    await expect(
      page.getByText('Esta orden pasa el saldo por 0,280 t. Quedan 82,720 t en la asignación.').first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Emitir', exact: true })).toBeDisabled();

    // Capacidad (50 t) y mismo camión el mismo día: dos excepciones con motivo.
    await page.getByLabel('Toneladas', { exact: true }).fill('50,5');
    await page.getByRole('button', { name: 'Emitir', exact: true }).click();
    for (const title of [/pasa la capacidad de los remolques/, /ya tiene otra orden con esa fecha de carga/]) {
      const dialog = page.getByRole('dialog', { name: title });
      await dialog.getByLabel('Motivo').fill('Autorizado por la empresa para esta carga');
      await dialog.getByRole('button', { name: 'Emitir con excepción' }).click();
    }
    await expect(page.getByText(`EAGLEPC-${havanaToday().slice(0, 4)}-V1-0002`, { exact: true })).toBeVisible();
    expect(
      await sql(
        `SELECT capacity_override_reason IS NOT NULL AS cap, same_day_override_reason IS NOT NULL AS day
           FROM load_order_versions v JOIN load_orders o ON o.id = v.order_id WHERE o.number LIKE 'EAGLEPC-%-0002'`,
      ),
    ).toEqual([{ cap: true, day: true }]);
    return;
  }

  if (device === 'tablet') {
    const w = await prepare({
      code: 'TAB',
      dm: '80432',
      plate: 'P802',
      nationalId: '84011905502',
      license: '80000000002',
    });
    const order = await w.api.request(ordersApi.issue, {
      body: {
        declarationId: w.dm.id,
        allocationId: w.dm.allocations[0]!.id,
        recipientId: w.client.recipients[0]!.id,
        truckId: w.truck.id,
        trailerIds: w.trailers.map((t) => t.id),
        driverId: w.driver.id,
        tons: '17.280',
        waybillNo: '22352',
        loadingDate: havanaToday(),
        lotNo: null,
        routeSheetNo: null,
        container: null,
      },
    });
    const operador = state.users.operador[device];
    await signIn(page, device, operador, `/ordenes/${order.id}`);

    // Quien no la emitió baja una copia (RF-ORD-21).
    const copy = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar una copia' }).click();
    expect((await copy).suggestedFilename()).toBe(`${order.number}-copia.pdf`);

    // P-16: corregir crea la versión 2 y el saldo cambia por la diferencia.
    await page.getByRole('button', { name: 'Corregir' }).click();
    await page.getByLabel('Toneladas', { exact: true }).fill('20');
    await expect(page.getByText(/Cambios frente a la versión 1: Toneladas: 17,280 t → 20,000 t/)).toBeVisible();
    await page.getByLabel('Motivo').fill(REASON);
    await page.getByRole('button', { name: 'Emitir la versión 2' }).click();
    await expect(page.getByText('Versión 2 · vigente')).toBeVisible();
    expect(await loaded(sql, '80432')).toBe('20.000');

    // Anular repone todo el saldo.
    await page.getByRole('button', { name: 'Anular' }).click();
    const dialog = page.getByRole('dialog', { name: `Anular ${order.number}` });
    await expect(dialog.getByText(/Se repondrán 20,000 t al saldo de la DM 80432/)).toBeVisible();
    await dialog.getByLabel('Motivo').fill('El camión no se presentó al puerto');
    await dialog.getByRole('button', { name: 'Anular' }).click();
    await expect(page.getByText(`Se anuló la orden ${order.number}.`)).toBeVisible();
    expect(await loaded(sql, '80432')).toBe('0.000');
    expect(await sql('SELECT status FROM load_orders WHERE id = $1', [order.id])).toEqual([{ status: 'voided' }]);
    return;
  }

  // TEL · EST-06: un borrador compartido abierto por otra persona se ve en edición y no se puede abrir.
  const w = await prepare({
    code: 'TEL',
    dm: '80433',
    plate: 'P803',
    nationalId: '84011905503',
    license: '80000000003',
  });
  const d = await w.api.request(draftsApi.save, {
    body: { clientDraftId: crypto.randomUUID(), visibility: 'shared', payload: { declarationId: w.dm.id, tons: '5' } },
  });
  await w.api.request(draftsApi.lock, { params: { id: d.id } });
  await signIn(page, device, state.users.operador[device], '/borradores');
  await page.getByRole('tab', { name: /Compartidos/ }).click();
  await expect(page.getByText(/En edición por/).first()).toBeVisible();
  await page.getByRole('button', { name: /80433/ }).click();
  await expect(page.getByText(/En edición por/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a los borradores' })).toBeVisible();
});
