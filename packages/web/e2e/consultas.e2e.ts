// T100 a T104 · P-06, P-12, P-25 y P-32 contra el servidor real (ui-spec, aceptación). Las tres clases corren a la vez,
// cada una con su buque, su DM y su camión: la PC ve en el tablero, en menos de 5 s, la orden que emite otra persona y
// la encuentra en la lista «Hoy» (y el filtro por chofer coincide con la base); la tablet busca la orden por su número
// y una DM de hace 14 meses solo con «Buscar en el archivo»; el teléfono filtra la bitácora por la orden.
import { ordersApi } from '../src/api/endpoints/orders';
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';
import { havanaToday, prepare } from './support/orders';

const DATA = {
  phone: { code: 'CNT', dm: '82041', plate: 'P821', nationalId: '84011905521', license: '80000000021' },
  tablet: { code: 'CNB', dm: '82042', plate: 'P822', nationalId: '84011905522', license: '80000000022' },
  desktop: { code: 'CNE', dm: '82043', plate: 'P823', nationalId: '84011905523', license: '80000000023' },
} as const;
const REASON = 'Peso corregido en la báscula del puerto';

test('P-06, P-12, P-25 y P-32 con datos reales', async ({ openApp, page, device, sql }) => {
  const state = readState();
  const k = DATA[device];
  const w = await prepare(k);
  const body = (tons: string) => ({
    declarationId: w.dm.id,
    allocationId: w.dm.allocations[0]!.id,
    recipientId: w.client.recipients[0]!.id,
    truckId: w.truck.id,
    trailerIds: w.trailers.map((t) => t.id),
    driverId: w.driver.id,
    tons,
    waybillNo: '22352',
    loadingDate: havanaToday(),
    lotNo: null,
    routeSheetNo: null,
    container: null,
  });

  await openApp('/');
  await pairApp(page, device);
  const operador = state.users.operador[device];
  await fillLogin(page, operador.username, operador.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  const go = (path: string) => page.evaluate((p) => (location.hash = p), `#${path}`);

  if (device === 'desktop') {
    // P-06: la orden de otra persona (la Apoderada) cambia la fila de su DM en menos de 5 s.
    const row = page.getByRole('row', { name: new RegExp(`^${k.dm}`) });
    await expect(row).toContainText('0,000 t');
    const issued = await w.api.request(ordersApi.issue, { body: body('17.280') });
    const started = Date.now();
    await expect(row).toContainText('17,280 t', { timeout: 5000 });
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(row).toContainText('17,3 %');

    // P-32: la orden en «Hoy»; el filtro por chofer coincide con la base (HU-17).
    await go('/ordenes');
    await expect(page.getByRole('row', { name: new RegExp(issued.number) })).toBeVisible();
    await page.getByLabel('Chofer').selectOption(w.driver.id);
    const [db] = await sql<{ n: string; tons: string }>(
      `SELECT count(*)::text AS n, coalesce(sum(v.tons) FILTER (WHERE o.status = 'official'), 0)::numeric(12,3)::text AS tons
         FROM load_orders o JOIN load_order_versions v ON v.id = o.current_version_id
        WHERE v.driver_id = $1 AND v.loading_date = $2`,
      [w.driver.id, havanaToday()],
    );
    const totals = page.getByRole('status', { name: 'Totales del rango' });
    await expect(totals).toContainText(`${db!.n}${db!.n === '1' ? 'orden' : 'órdenes'}`);
    await expect(totals).toContainText(db!.tons.replace('.', ','));
    return;
  }

  if (device === 'tablet') {
    // P-12: la orden por su número completo, y se abre.
    const issued = await w.api.request(ordersApi.issue, { body: body('10') });
    await go(`/buscar?q=${issued.number}`);
    await page.getByRole('button', { name: new RegExp(`^${issued.number}`) }).click();
    await expect(page.getByRole('heading', { name: 'Orden' }).first()).toBeVisible();

    // RF-CON-07: una DM de hace 14 meses no está en el dispositivo; solo «Buscar en el archivo» la trae.
    const old = new Date();
    old.setUTCMonth(old.getUTCMonth() - 14);
    const oldDate = old.toISOString().slice(0, 10);
    // En dos pasos: un UPDATE en el mismo WITH no ve la fila que acaba de insertar.
    const [v] = await sql<{ id: string; declaration_id: string }>(
      `WITH d AS (
         INSERT INTO customs_declarations (number, client_id, declaration_date, deadline_start_date, created_at)
         VALUES ('82142', $1, $2, $2, now()) RETURNING id)
       INSERT INTO customs_declaration_versions (declaration_id, version_no, brand, total_tons, kind, created_at)
       SELECT id, 1, 'Archivo', NULL, 'create', now() FROM d RETURNING id, declaration_id`,
      [w.client.id, oldDate],
    );
    await sql('UPDATE customs_declarations SET current_version_id = $1 WHERE id = $2', [v!.id, v!.declaration_id]);
    await go('/buscar?q=82142');
    await expect(page.getByText('En este dispositivo no hay nada con «82142».')).toBeVisible();
    await page.getByRole('button', { name: 'Buscar en el archivo' }).click();
    await expect(page.getByRole('region', { name: 'DM del archivo · 1' })).toBeVisible();
    return;
  }

  // TEL · P-25: la bitácora de la orden: su emisión y su corrección, con quién las hizo (HU-13).
  const issued = await w.api.request(ordersApi.issue, { body: body('10') });
  await w.api.request(ordersApi.correct, {
    params: { id: issued.id },
    body: { ...body('12'), reason: REASON, expectedVersion: 1 },
  });
  await go('/bitacora');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('DM u orden').fill(issued.number);
  await page.keyboard.press('Escape');
  const cards = page.getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Corregir orden');
  await expect(cards.nth(0)).toContainText(`Motivo: ${REASON}`);
  await expect(cards.nth(1)).toContainText('Emitir orden');
});
